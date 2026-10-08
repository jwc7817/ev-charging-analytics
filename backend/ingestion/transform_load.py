import logging
import sys
from pathlib import Path
from typing import Any, Dict, List

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert

INGESTION_DIR = Path(__file__).resolve().parent
BACKEND_DIR = INGESTION_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from db.connection import get_db_session, get_engine
from models.models import Base, ChargingStation

logger = logging.getLogger(__name__)


def init_db_schema():
    """Initializes PostGIS extensions, creates missing tables, and manages spatial indexes safely."""
    engine = get_engine()
    
    # 1. Enable PostGIS extension and safely drop any dangling spatial indexes
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
    
    # 2. Reflect existing tables before calling create_all to prevent duplicate DDL triggers
    Base.metadata.create_all(bind=engine, checkfirst=True)
    
    # 3. Explicitly create GiST index if PostGIS did not create it automatically
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_charging_stations_geom 
            ON charging_stations USING gist (geom);
        """))

def calculate_station_kw(s: Dict[str, Any]) -> float:
    """Calculates total station power capacity (kW) from explicit units or level heuristics."""
    total_kw = 0.0
    units = s.get("ev_charging_units") or []

    for unit in units:
        connectors = unit.get("connectors") or {}
        for connector_data in connectors.values():
            p_kw = connector_data.get("power_kw")
            p_count = connector_data.get("port_count") or 0
            if p_kw and p_count:
                total_kw += float(p_kw) * int(p_count)

    if total_kw == 0.0:
        l1 = int(s.get("ev_level1_evse_num") or 0)
        l2 = int(s.get("ev_level2_evse_num") or 0)
        dcfc = int(s.get("ev_dc_fast_num") or 0)
        total_kw = (l1 * 1.9) + (l2 * 7.2) + (dcfc * 150.0)

    return round(total_kw, 2)


def process_and_load_stations(station_batch: List[Dict[str, Any]]):
    """Processes a batch of raw AFDC station dictionaries and upserts into PostGIS."""
    if not station_batch:
        return

    stations_to_upsert = []

    for s in station_batch:
        lat = s.get("latitude")
        lon = s.get("longitude")

        if lat is None or lon is None:
            continue

        point_geom = from_shape(Point(float(lon), float(lat)), srid=4326)
        
        geocode = s.get("geocode_status")
        accuracy = 99 if geocode == "GPS" else s.get("position_accuracy", 0)

        l1_ports = int(s.get("ev_level1_evse_num") or 0)
        l2_ports = int(s.get("ev_level2_evse_num") or 0)
        dcfc_ports = int(s.get("ev_dc_fast_num") or 0)
        capacity_kw = calculate_station_kw(s)

        stations_to_upsert.append({
            "id": s["id"],
            "station_name": s.get("station_name", "Unknown Station"),
            "status_code": s.get("status_code", "U"),
            "access_code": s.get("access_code", "public"),
            "facility_type": s.get("facility_type"),
            "ev_pricing": s.get("ev_pricing"),
            "street_address": s.get("street_address"),
            "city": s.get("city"),
            "state": s.get("state"),
            "zip": s.get("zip"),
            "latitude": float(lat),
            "longitude": float(lon),
            "position_accuracy": accuracy,
            "ev_level1_evse_num": l1_ports,
            "ev_level2_evse_num": l2_ports,
            "ev_dc_fast_num": dcfc_ports,
            "total_capacity_kw": capacity_kw,
            "geom": point_geom,
        })

    if not stations_to_upsert:
        return

    session_gen = get_db_session()
    session = next(session_gen) if hasattr(session_gen, "__next__") else session_gen

    try:
        stmt = insert(ChargingStation).values(stations_to_upsert)

        update_dict = {
            col.name: getattr(stmt.excluded, col.name)
            for col in ChargingStation.__table__.columns
            if col.name not in ["id"]
        }

        upsert_stmt = stmt.on_conflict_do_update(
            index_elements=[ChargingStation.id],
            set_=update_dict
        )

        session.execute(upsert_stmt)
        session.commit()
        logger.debug(f"Successfully processed and upserted batch of {len(stations_to_upsert)} records.")
    except Exception as e:
        session.rollback()
        logger.error(f"Error upserting station batch: {e}")
        raise
    finally:
        session.close()