module.exports = {
  apps: [
    {
      name: "readkar-backend-api",
      script: ".venv/Scripts/uvicorn.exe",
      args: "app.main:app --host 0.0.0.0 --port 8000 --workers 2",
      cwd: "./",
      interpreter: "none",
      watch: false,
      autorestart: true,
      env: {
        PYTHONUNBUFFERED: "1",
        ENABLE_IN_APP_PIPELINE_WORKERS: "true"
      }
    }
  ]
};
