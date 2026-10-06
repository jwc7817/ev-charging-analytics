from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    ForeignKey,
    CheckConstraint,
    Index,
)
from sqlalchemy.orm import relationship, declarative_base
from geoalchemy2 import Geography

Base = declarative_base()


class GeographicRegion(Base):
    __tablename__ = "geographic_regions"

    region_id = Column(Integer, primary_key=True, autoincrement=True)
    state_code = Column(String(2), nullable=False, index=True)
    county_name = Column(String(100), nullable=True)
    # Storing boundaries as MultiPolygon for regional density/coverage analytics
    geom = Column(Geography("MULTIPOLYGON", srid=4326), nullable=True)

    stations = relationship("ChargingStation", back_populates="region")


class ChargingNetwork(Base):
    __tablename__ = "charging_networks"

    network_id = Column(Integer, primary_key=True, autoincrement=True)
    network_name = Column(String(100), unique=True, nullable=False)

    stations = relationship("ChargingStation", back_populates="network")


class ConnectorType(Base):
    __tablename__ = "connector_types"

    connector_type_id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(20), unique=True, nullable=False)  # e.g., 'J1772', 'CCS', 'TESLA'
    name = Column(String(50), nullable=False)

    station_connectors = relationship("StationConnector", back_populates="connector_type")


class ChargingStation(Base):
    __tablename__ = "charging_stations"

    station_id = Column(Integer, primary_key=True, autoincrement=True)
    afdc_id = Column(Integer, unique=True, nullable=False, index=True)
    station_name = Column(String(255), nullable=False)
    street_address = Column(String(255), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(2), nullable=False)
    zip_code = Column(String(10), nullable=True)
    
    # AFDC location precision indicator
    location_specificity = Column(Integer, nullable=True)

    # Core spatial point: WGS84 EPSG:4326 (Lon, Lat)
    location = Column(Geography(geometry_type="POINT", srid=4326), nullable=False)

    network_id = Column(Integer, ForeignKey("charging_networks.network_id"), nullable=True)
    region_id = Column(Integer, ForeignKey("geographic_regions.region_id"), nullable=True)

    network = relationship("ChargingNetwork", back_populates="stations")
    region = relationship("GeographicRegion", back_populates="stations")
    connectors = relationship("StationConnector", back_populates="station", cascade="all, delete-orphan")

    __table_args__ = (
        # PostGIS GiST index for fast spatial queries (ST_DWithin, ST_Distance)
        Index("idx_stations_location", "location", postgresql_using="gist"),
        CheckConstraint(
            "location_specificity IS NULL OR (location_specificity >= 0 AND location_specificity <= 100)",
            name="check_location_specificity_range",
        ),
    )


class StationConnector(Base):
    """Junction table mapping chargers to connector types with capability details."""
    __tablename__ = "station_connectors"

    station_id = Column(Integer, ForeignKey("charging_stations.station_id"), primary_key=True)
    connector_type_id = Column(Integer, ForeignKey("connector_types.connector_type_id"), primary_key=True)
    count = Column(Integer, default=1, nullable=False)
    power_kw = Column(Float, nullable=True)  # Charging capability in kW

    station = relationship("ChargingStation", back_populates="connectors")
    connector_type = relationship("ConnectorType", back_populates="station_connectors")