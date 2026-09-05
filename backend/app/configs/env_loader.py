import os
from pathlib import Path
from dotenv import load_dotenv

# Base backend directory
backend_root = Path(__file__).resolve().parent.parent.parent

# 1. First load .env (base defaults/credentials)
base_env_path = backend_root / ".env"
if base_env_path.exists():
    load_dotenv(dotenv_path=base_env_path, override=False)

# 2. Determine environment (e.g., 'development' or 'production')
APP_ENV = os.getenv("APP_ENV", "development")

# 3. Load environment-specific file if exists (.env.development or .env.production) with override=True
env_specific_path = backend_root / f".env.{APP_ENV}"
if env_specific_path.exists():
    load_dotenv(dotenv_path=env_specific_path, override=True)
