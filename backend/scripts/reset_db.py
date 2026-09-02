import os
import sys
import argparse
from pathlib import Path
from dotenv import load_dotenv

# Ensure backend root is on sys.path
backend_root = Path(__file__).resolve().parents[1]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

# Load .env
load_dotenv(dotenv_path=backend_root / ".env")

from sqlalchemy import create_engine, text
from alembic.config import Config
from alembic import command
from app.models import Base


def reset_database(force: bool = False, use_alembic: bool = True) -> None:
    """
    Completely drops all tables and schemas, re-creates schema,
    and applies all migrations or metadata schemas.
    """
    db_url = os.getenv("DB")
    if not db_url:
        print("[ERROR] 'DB' environment variable is not set in .env file.")
        sys.exit(1)

    # Standardize postgres driver URL
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    print(f"\n=======================================================")
    print(f" Database Reset Tool - Cloud PDF Reader")
    print(f" Target DB URL: {db_url.split('@')[-1] if '@' in db_url else db_url}")
    print(f"=======================================================\n")

    if not force:
        confirm = input("Are you SURE you want to drop and reset ALL database tables? (yes/no): ").strip().lower()
        if confirm not in ("yes", "y"):
            print("Operation aborted by user.")
            sys.exit(0)

    try:
        print("[1/3] Connecting to PostgreSQL database...")
        engine = create_engine(db_url, isolation_level="AUTOCOMMIT")

        print("[2/3] Dropping all existing tables, foreign keys, and custom enum types...")
        with engine.connect() as conn:
            # Recreate public schema to cleanly wipe all tables, types, and constraints
            conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE;"))
            conn.execute(text("CREATE SCHEMA public;"))
            conn.execute(text("GRANT ALL ON SCHEMA public TO public;"))
        print("  -> Successfully cleared public schema.")

        print("[3/3] Applying schema setup...")
        alembic_ini_path = backend_root / "alembic.ini"
        if use_alembic and alembic_ini_path.exists():
            print("  -> Running Alembic migrations (upgrade head)...")
            alembic_cfg = Config(str(alembic_ini_path))
            alembic_cfg.set_main_option("script_location", str(backend_root / "alembic"))
            alembic_cfg.set_main_option("sqlalchemy.url", db_url)
            command.upgrade(alembic_cfg, "head")
            print("  -> Alembic migrations successfully applied to head.")
        else:
            print("  -> Creating tables directly from SQLAlchemy models...")
            Base.metadata.create_all(bind=engine)
            print("  -> Tables created successfully.")

        print("\n [SUCCESS] Database reset completed successfully! All tables are ready.\n")

    except Exception as e:
        print(f"\n[ERROR] Database reset failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reset PostgreSQL database tables and apply migrations.")
    parser.add_argument(
        "--force", "-f",
        action="store_true",
        help="Skip confirmation prompt."
    )
    parser.add_argument(
        "--no-alembic",
        action="store_true",
        help="Create tables via SQLAlchemy Base.metadata instead of Alembic migrations."
    )

    args = parser.parse_args()
    reset_database(force=args.force, use_alembic=not args.no_alembic)
