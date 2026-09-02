import os
import sys
from logging.config import fileConfig
from pathlib import Path
from dotenv import load_dotenv

from sqlalchemy import engine_from_config, pool
from alembic import context

# Ensure backend root is in sys.path
backend_root = Path(__file__).resolve().parents[1]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

# Load .env file
load_dotenv(dotenv_path=backend_root / ".env")

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set database URL dynamically from environment
database_url = os.getenv("DB")
if database_url:
    # Ensure standard postgresql driver format if necessary
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    config.set_main_option("sqlalchemy.url", database_url)

# Import all models to register with Base.metadata
from app.models import Base
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    from app.configs.db.config import engine as connectable

    if connectable is None:
        raise RuntimeError("Database engine is not initialized. Check DB credentials.")

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
