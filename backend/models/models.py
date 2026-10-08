import datetime
from typing import List, Optional
from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# Association Table for Many-to-Many: ChargingStation <-> ConnectorType
station_connectors = Table(
    "station_connectors",
    Base.metadata,
    Column("station_id", BigInteger, ForeignKey("charging_stations.id", ondelete="CASCADE"), primary_key=True),
    Column("connector_code", String(20), ForeignKey("connector_types.code", ondelete="CASCADE"), primary_key=True),
)


class Network(Base):
    """Charging Networks (e.g., Tesla Supercharger, ChargePoint, Electrify America)."""
    __tablename__ = "charging_networks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    stations: Mapped[List["ChargingStation"]] = relationship("ChargingStation", back_populates="network")


class ConnectorType(Base):
    """Standardized EV Connector Types (e.g., J1772, CCS, CHAdeMO, NACS)."""
    __tablename__ = "connector_types"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)  # e.g. 'J1772', 'NACS'
    description: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    stations: Mapped[List["ChargingStation"]] = relationship(
        "ChargingStation", secondary=station_connectors, back_populates="connectors"
    )


class ChargingStation(Base):
    __tablename__ = "charging_stations"

    id = Column(Integer, primary_key=True, autoincrement=False)
    station_name = Column(String(255), nullable=False)
    status_code = Column(String(10))
    access_code = Column(String(50))
    facility_type = Column(String(100))
    ev_pricing = Column(String(255))
    street_address = Column(String(255))
    city = Column(String(100))
    state = Column(String(50))
    zip = Column(String(20))
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    position_accuracy = Column(Integer)
    ev_level1_evse_num = Column(Integer, default=0)
    ev_level2_evse_num = Column(Integer, default=0)
    ev_dc_fast_num = Column(Integer, default=0)
    total_capacity_kw = Column(Float, default=0.0)
    
    # spatial_index=True automatically builds the GiST index on geom
    geom = Column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True))