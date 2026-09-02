module.exports = {
  apps: [
    {
      name: "pdf-backend-api",
      script: ".venv/Scripts/uvicorn.exe",
      args: "app.main:app --host 0.0.0.0 --port 8000 --reload",
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
