-- Enable PostGIS Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ---------------------------------------------------------------------
-- 1. Charging Stations Table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS charging_stations (
    id BIGINT PRIMARY KEY,
    station_name VARCHAR(255) NOT NULL,
    status_code VARCHAR(10),
    access_code VARCHAR(50),
    facility_type VARCHAR(100),
    ev_pricing VARCHAR(255),
    street_address VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50) NOT NULL,
    zip VARCHAR(20),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    position_accuracy INT DEFAULT 0,
    ev_level1_evse_num INT DEFAULT 0,
    ev_level2_evse_num INT DEFAULT 0,
    ev_dc_fast_num INT DEFAULT 0,
    total_capacity_kw DOUBLE PRECISION DEFAULT 0.0,
    geom GEOMETRY(Point, 4326) NOT NULL
);

-- Primary GiST Spatial Index for ST_DWithin and spatial joins
CREATE INDEX IF NOT EXISTS idx_charging_stations_geom_gist 
ON charging_stations USING gist (geom);

-- Composite Index for filtering by state before spatial calculation
CREATE INDEX IF NOT EXISTS idx_charging_stations_state_geom 
ON charging_stations (state, geom);

-- ---------------------------------------------------------------------
-- 2. Census Tracts Table (Ingested from TIGER/Line Shapefiles)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS census_tracts (
    geoid VARCHAR(11) PRIMARY KEY,
    statefp VARCHAR(2) NOT NULL,
    countyfp VARCHAR(3) NOT NULL,
    tractce VARCHAR(6) NOT NULL,
    name VARCHAR(100),
    population INT DEFAULT 0,
    land_area_sqm DOUBLE PRECISION DEFAULT 0.0,
    geom GEOMETRY(MultiPolygon, 4326) NOT NULL
);

-- GiST Spatial Index on Census Tract Polygons
CREATE INDEX IF NOT EXISTS idx_census_tracts_geom_gist 
ON census_tracts USING gist (geom);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_census_tract_accessibility AS
SELECT 
    ct.geoid,
    ct.name AS tract_name,
    ct.statefp,
    ct.countyfp,
    ct.population,
    ROUND((ct.land_area_sqm / 1000000.0)::numeric, 3) AS land_area_sqkm,
    COUNT(cs.id) AS total_stations,
    COALESCE(SUM(cs.ev_dc_fast_num), 0) AS total_dcfc_ports,
    COALESCE(SUM(cs.total_capacity_kw), 0.0) AS total_capacity_kw,
    -- Compute Accessibility Index: kW per 1,000 residents per sq km
    ROUND(
        (
            COALESCE(SUM(cs.total_capacity_kw), 0.0) / 
            GREATEST(1.0, ((ct.population / 1000.0) * (ct.land_area_sqm / 1000000.0)))
        )::numeric, 
        4
    ) AS accessibility_index,
    ct.geom
FROM census_tracts ct
LEFT JOIN charging_stations cs 
    ON ST_Intersects(ct.geom, cs.geom)
GROUP BY ct.geoid, ct.name, ct.statefp, ct.countyfp, ct.population, ct.land_area_sqm, ct.geom;

CREATE INDEX IF NOT EXISTS idx_mv_census_tract_accessibility_geom 
ON mv_census_tract_accessibility USING gist (geom);

-- ---------------------------------------------------------------------
-- 3. SP-GiST Indexing Experimentation (For Benchmarking)
-- Note: SP-GiST can be built on 2D Point geometries for comparison
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_charging_stations_geom_spgist 
ON charging_stations USING spgist (geom);


