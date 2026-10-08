import logging
import os
from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, Session

logger = logging.getLogger(__name__)

_engine: Engine | None = None
_SessionFactory: sessionmaker | None = None


def get_engine() -> Engine:
    """
    Returns a singleton SQLAlchemy Engine connected to PostgreSQL/PostGIS.
    Initializes a connection pool on first execution.
    """
    global _engine, _SessionFactory
    if _engine is None:
        # Fallback URI construct if dynamic individual env vars are preferred
        default_uri = (
            f"postgresql+psycopg://{os.getenv('POSTGRES_USER', 'postgres')}:"
            f"{os.getenv('POSTGRES_PASSWORD', 'postgres')}@"
            f"{os.getenv('POSTGRES_HOST', 'localhost')}:"
            f"{os.getenv('POSTGRES_PORT', '5432')}/"
            f"{os.getenv('POSTGRES_DB', 'ev_analytics')}"
        )
        
        db_uri = os.getenv("POSTGRES_URI", default_uri)

        _engine = create_engine(
            db_uri,
            pool_size=10,            # Connections kept open in the pool
            max_overflow=20,         # Temporary connections above pool_size during bursts
            pool_pre_ping=True,      # Tests connection liveness before checking out
            pool_recycle=1800,       # Recycles connections every 30 mins to avoid stale sockets
            echo=False,              # Set to True for verbose SQL debug logging
        )
        
        # Verify PostGIS extension is loaded upon connection start
        with _engine.connect() as conn:
            result = conn.execute(text("SELECT PostGIS_Full_Version();")).scalar()
            logger.info(f"PostgreSQL/PostGIS Connection Established. Engine details: {result}")

        _SessionFactory = sessionmaker(bind=_engine, autoflush=False, autocommit=False)

    return _engine


def get_db_session() -> Generator[Session, None, None]:
    """
    Context manager / FastAPI dependency yielding a transactional database session.
    Automatically handles rollback on error and resource cleanup/close.
    """
    if _SessionFactory is None:
        get_engine()

    assert _SessionFactory is not None
    session: Session = _SessionFactory()
    try:
        yield session
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Database session rolled back due to error: {e}")
        raise
    finally:
        session.close()


def close_db_engine() -> None:
    """
    Disposes of the connection pool gracefully on application shutdown.
    """
    global _engine, _SessionFactory
    if _engine is not None:
        _engine.dispose()
        _engine = None
        _SessionFactory = None
        logger.info("PostgreSQL engine pool disposed.")