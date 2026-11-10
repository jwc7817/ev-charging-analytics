import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import logging
import geopandas as gpd
from sqlalchemy import text
from db.connection import get_engine

logger = logging.getLogger("uvicorn")

# Sample Census TIGER/Line Shapefile URL (e.g. California Census Tracts)
# Download state shapefiles from US Census Bureau or Census API
CENSUS_SHAPEFILE_URL = "https://www2.census.gov/geo/tiger/TIGER2023/TRACT/tl_2023_06_tract.zip"

def ingest_census_tracts(shapefile_path_or_url: str):
    """
    Reads Census TIGER/Line shapefile into GeoDataFrame, standardizes CRS 
    to EPSG:4326, and upserts polygons into PostGIS.
    """
    engine = get_engine()
    logger.info(f"Downloading and reading Census Shapefile: {shapefile_path_or_url}")
    
    # Read Shapefile directly via GeoPandas
    gdf = gpd.read_file(shapefile_path_or_url)
    
    # Ensure standard WGS84 CRS (EPSG:4326)
    if gdf.crs != "EPSG:4326":
        gdf = gdf.to_crs(epsg=4326)
        
    # Standardize column mapping to database schema
    gdf = gdf.rename(columns={
        "GEOID": "geoid",
        "STATEFP": "statefp",
        "COUNTYFP": "countyfp",
        "TRACTCE": "tractce",
        "NAME": "name",
        "ALAND": "land_area_sqm",
        "geometry": "geom"
    })

    gdf = gdf.set_geometry("geom")
    
    # Assign default population estimate if not merged yet (e.g., Decennial Census API)
    if "population" not in gdf.columns:
        gdf["population"] = 4000  # Default tract average placeholder until ACS fetch
        
    selected_cols = ["geoid", "statefp", "countyfp", "tractce", "name", "population", "land_area_sqm", "geom"]
    gdf_to_load = gdf[selected_cols]

    logger.info(f"Writing {len(gdf_to_load)} Census Tracts to PostGIS...")
    
    # Write to PostGIS using GeoPandas PostGIS engine
    gdf_to_load.to_postgis(
        name="census_tracts",
        con=engine,
        if_exists="append",
        index=False,
        chunksize=1000
    )
    
    # Refresh Materialized View
    with engine.begin() as conn:
        conn.execute(text("REFRESH MATERIALIZED VIEW mv_census_tract_accessibility;"))
        
    logger.info("Census Tract ingestion complete and Materialized View refreshed.")

if __name__ == "__main__":
    ingest_census_tracts(CENSUS_SHAPEFILE_URL)