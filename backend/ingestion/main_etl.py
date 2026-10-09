import os
import logging
from tqdm import tqdm
from ingestion.extract_afdc import fetch_stations_by_state
from ingestion.transform_load import init_db_schema, process_and_load_stations

# Mute noisy third-party loggers during ETL
logging.getLogger("ingestion.transform_load").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Fetch the key from the environment variable set in docker-compose.yml / .env
api_key = os.getenv("NREL_API_KEY")

if not api_key:
    logger.warning("NREL_API_KEY not found in environment. Falling back to DEMO_KEY.")
    api_key = "DEMO_KEY"




def run_pipeline():
    logger.info("Initializing PostGIS schema...")
    init_db_schema()

    batch = []
    batch_size = 2500  
    total_processed = 0

    logger.info("Starting ingestion...")

    # Pass the dynamic variable to the generator
    station_stream = fetch_stations_by_state(api_key=api_key)
    
    with tqdm(desc="Ingesting AFDC Stations", unit=" recs", mininterval=0.5) as pbar:
        for station in station_stream:
            batch.append(station)
            if len(batch) >= batch_size:
                process_and_load_stations(batch)
                total_processed += len(batch)
                pbar.update(len(batch))
                batch = []

        if batch:
            process_and_load_stations(batch)
            total_processed += len(batch)
            pbar.update(len(batch))

    logger.info(f"Pipeline complete! Total records in PostGIS: {total_processed:,}")

if __name__ == "__main__":
    run_pipeline()