
import logging
from typing import List, Optional
from fastapi import FastAPI, Depends, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from db.connection import get_db_session

logger = logging.getLogger("uvicorn")

app = FastAPI(title="EV Infrastructure Accessibility API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "service": "EV Charging Accessibility API"}

@app.get("/api/v1/stations")
def get_charging_stations(
    limit: int = Query(default=5000, ge=1, le=50000, description="Max station count to return"),
    states: Optional[List[str]] = Query(default=None, description="Multi-state filter (e.g., ?states=CA&states=NY)"),
    db: Session = Depends(get_db_session)
):
    """
    Retrieves charging stations from PostGIS as a GeoJSON FeatureCollection,
    supporting dynamic limit bounds and multi-state selection array filtering.
    """
    try:
        where_conditions = []
        params = {"limit_val": limit}

        # Handle multi-state array filtering
        if states:
            # Clean and uppercase state strings (e.g. ['ca', 'ny'] -> ['CA', 'NY'])
            clean_states = [s.strip().upper() for s in states if s.strip()]
            if clean_states:
                where_conditions.append("state = ANY(:states_arr)")
                params["states_arr"] = clean_states

        where_clause = f"WHERE {' AND '.join(where_conditions)}" if where_conditions else ""

        query = text(f"""
            SELECT json_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)
            )
            FROM (
                SELECT 
                    id,
                    station_name,
                    state,
                    city,
                    street_address,
                    total_capacity_kw,
                    ev_dc_fast_num,
                    ev_level2_evse_num,
                    access_code,
                    geom
                FROM charging_stations
                {where_clause}
                LIMIT :limit_val
            ) AS t;
        """)

        result = db.execute(query, params).scalar()
        return result

    except Exception as e:
        logger.error(f"Error fetching stations from PostGIS: {e}")
        raise HTTPException(status_code=500, detail="Database spatial query execution failed.")