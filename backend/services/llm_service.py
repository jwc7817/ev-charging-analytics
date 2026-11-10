import os
from dotenv import load_dotenv
import re
import json
import logging
from decimal import Decimal
from datetime import datetime, date
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from sqlalchemy import text
from sqlalchemy.orm import Session
from google import genai
from google.genai import types


logger = logging.getLogger("uvicorn")

# ------------------------------------------------------------------
# Pydantic Schema for Structured Gemini Output
# ------------------------------------------------------------------
class LLMSpatialSQLResponse(BaseModel):
    sql: str = Field(
        description="A single valid PostgreSQL/PostGIS SELECT statement to answer the natural language prompt."
    )
    explanation: str = Field(
        description="A concise explanation of the spatial query logic used (e.g. ST_DWithin radius search, state filtering)."
    )

# ------------------------------------------------------------------
# System Database Context Prompt
# ------------------------------------------------------------------
SYSTEM_DB_PROMPT = """
You are an expert PostGIS Spatial SQL Generator for an EV Infrastructure Analytics platform.
Your job is to translate natural language user questions into valid, optimized, read-only PostgreSQL/PostGIS SQL queries.

DATABASE SCHEMA:
1. Table: charging_stations
   - id BIGINT PRIMARY KEY
   - station_name VARCHAR(255)
   - street_address VARCHAR(255)
   - city VARCHAR(100)
   - state VARCHAR(50) (2-letter postal abbreviation, e.g., 'CA', 'NY', 'TX')
   - zip VARCHAR(20)
   - ev_level1_evse_num INT
   - ev_level2_evse_num INT
   - ev_dc_fast_num INT
   - total_capacity_kw DOUBLE PRECISION
   - geom GEOMETRY(Point, 4326)

2. Table: census_tracts
   - geoid VARCHAR(11) PRIMARY KEY
   - statefp VARCHAR(2)
   - name VARCHAR(100)
   - population INT
   - land_area_sqm DOUBLE PRECISION
   - geom GEOMETRY(MultiPolygon, 4326)

3. Materialized View: mv_census_tract_accessibility
   - geoid VARCHAR(11)
   - tract_name VARCHAR(100)
   - population INT
   - total_stations INT
   - total_dcfc_ports INT
   - total_capacity_kw DOUBLE PRECISION
   - accessibility_index DOUBLE PRECISION
   - geom GEOMETRY(MultiPolygon, 4326)

RULES & SPATIAL CONSTRAINTS:
1. Return ONLY valid SELECT or WITH statements. Never output INSERT, UPDATE, DELETE, DROP, ALTER, or TRUNCATE.
2. For distance/radius operations, use PostGIS geography casting:
   ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography, distance_meters).
3. For Nearest-Neighbor (k-NN) queries, use the GiST bounding-box distance operator:
   ORDER BY geom <-> ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) LIMIT k.
4. When selecting stations for map display, include at minimum: 
   'id', 'station_name', 'state', 'city', 'total_capacity_kw', 'ev_dc_fast_num',
   ST_Y(geom) AS latitude, ST_X(geom) AS longitude.
5. Limit unconstrained result sets to a maximum of 5,000 rows (LIMIT 5000) to prevent engine memory exhaustion. If the user sets a specific limit, allow for higher query limit.
"""

# ------------------------------------------------------------------
# SQL Security Validator
# ------------------------------------------------------------------
def sanitize_and_validate_sql(sql: str) -> str:
    """
    Strict security check enforcing read-only SELECT execution.
    """
    cleaned_sql = sql.strip().rstrip(";")
    
    # Reject mutating DDL/DML statements
    forbidden_keywords = r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE)\b"
    if re.search(forbidden_keywords, cleaned_sql, re.IGNORECASE):
        raise ValueError("Security Violation: LLM generated non-read-only SQL statement.")
    
    # Enforce SELECT / CTE openings
    if not (cleaned_sql.upper().startswith("SELECT") or cleaned_sql.upper().startswith("WITH")):
        raise ValueError("Invalid SQL: Only SELECT or CTE queries are permitted.")
        
    return cleaned_sql

# ------------------------------------------------------------------
# Output Serialization Helper
# ------------------------------------------------------------------
def _serialize_row(row_dict: dict) -> dict:
    """
    Ensures datatypes returned by psycopg/SQLAlchemy (e.g. Decimals, Dates)
    are converted into JSON-serializable types for FastAPI.
    """
    serialized = {}
    for key, val in row_dict.items():
        if isinstance(val, Decimal):
            serialized[key] = float(val)
        elif isinstance(val, (datetime, date)):
            serialized[key] = val.isoformat()
        else:
            serialized[key] = val
    return serialized

# ------------------------------------------------------------------
# Main Natural Language Pipeline
# ------------------------------------------------------------------
def process_natural_language_query(user_prompt: str, db: Session) -> Dict[str, Any]:
    """
    Translates user prompt to PostGIS SQL using Google Gemini API,
    validates execution safety, executes against DB, and returns result dictionary.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("LLM_API_KEY")
    if not api_key:
        raise ValueError("Gemini API Key (GEMINI_API_KEY) is not set in environment variables.")

    # 1. Initialize Gemini Client
    client = genai.Client(api_key=api_key)

    # 2. Configure Structured JSON Output Request
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_DB_PROMPT,
        temperature=0.1,  # Low temperature for precise SQL generation
        response_mime_type="application/json",
        response_schema=LLMSpatialSQLResponse,
    )

    try:
        # 3. Call Gemini API (gemini-2.5-flash)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=user_prompt,
            config=config,
        )
        
        # 4. Parse Structured JSON Response
        parsed_response = json.loads(response.text)
        raw_sql = parsed_response.get("sql", "")
        explanation = parsed_response.get("explanation", "")

        logger.info(f"[GEMINI SQL GENERATED]: {raw_sql}")

        # 5. Validate & Sanitize generated SQL
        validated_sql = sanitize_and_validate_sql(raw_sql)

        # 6. Execute against PostGIS database
        result_proxy = db.execute(text(validated_sql))
        
        rows = []
        if result_proxy.returns_rows:
            rows = [_serialize_row(dict(row._mapping)) for row in result_proxy]

        return {
            "user_prompt": user_prompt,
            "generated_sql": validated_sql,
            "explanation": explanation,
            "data": rows,
            "count": len(rows)
        }

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini response as JSON: {e}")
        raise ValueError("LLM response did not conform to JSON output specifications.")
    except Exception as e:
        logger.error(f"Text-to-PostGIS pipeline error: {e}")
        raise e