
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
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




@app.get("/")
def read_root():
    return {"status": "ok", "service": "EV Charging Accessibility API"}

@app.get("/health")
def health_check():
    return {"status": "online", "database_engine": "PostGIS 3.4", "llm_status": "Gemini 2.5 Ready"}

@app.get("/api/v1/stations")
def get_charging_stations(
    limit: int = Query(default=5000, ge=1, le=500000, description="Max station count to return"),
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

@app.get("/api/v1/census/accessibility")
def get_census_accessibility_polygons(
    state_fp: str = Query(..., description="2-digit State FIPS code (e.g., '06' for CA, '36' for NY)"),
    min_index: Optional[float] = Query(default=None, description="Filter tracts below accessibility threshold"),
    db: Session = Depends(get_db_session)
):
    """
    Retrieves pre-computed Census Tract accessibility index polygons as GeoJSON.
    """
    try:
        where_conditions = ["statefp = :state_fp"]
        params = {"state_fp": state_fp}
        
        if min_index is not None:
            where_conditions.append("accessibility_index >= :min_index")
            params["min_index"] = min_index

        where_clause = f"WHERE {' AND '.join(where_conditions)}"

        query = text(f"""
            SELECT json_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)
            )
            FROM (
                SELECT 
                    geoid, tract_name, population, total_stations, 
                    total_dcfc_ports, total_capacity_kw, accessibility_index, geom
                FROM mv_census_tract_accessibility
                {where_clause}
                LIMIT 5000
            ) AS t;
        """)

        result = db.execute(query, params).scalar()
        return result

    except Exception as e:
        logger.error(f"Failed to fetch Census Accessibility GeoJSON: {e}")
        raise HTTPException(status_code=500, detail="Database spatial query execution failed.")

from pydantic import BaseModel
from services.llm_service import process_natural_language_query, sanitize_and_validate_sql

class NaturalLanguageQueryRequest(BaseModel):
    prompt: str

@app.post("/api/v1/llm/query")
def execute_natural_language_query(
    request: NaturalLanguageQueryRequest,
    db: Session = Depends(get_db_session)
):
    """
    Text-to-Spatial-SQL Endpoint: Translates plain text prompts into 
    validated PostGIS spatial queries and executes them against the database.
    """
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    try:
        result = process_natural_language_query(request.prompt, db)
        return result
    except ValueError as ve:
        logger.warning(f"SQL Validation Error: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"LLM Spatial Query Execution Failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to translate or execute natural language spatial query.")