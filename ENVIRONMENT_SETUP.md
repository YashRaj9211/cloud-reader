# Environment Setup Guide (Dev & Prod)

This guide explains how to switch between local development and production environments for Cloud PDF Reader.

## Backend Configuration

The backend uses `python-dotenv` to load environment variables and has been configured to support multiple environments via the `APP_ENV` variable.

1. **Base Secrets (`.env`)**: Contains shared secrets like database passwords, API keys, etc. Also contains `APP_ENV` which determines which specific environment file to load next.
2. **Development (`.env.development`)**: Contains local configuration overrides (e.g., `FRONTEND_URL="http://localhost:3000"`, `GOOGLE_REDIRECT_URI="http://localhost:4001/api/auth/callback"`).
3. **Production (`.env.production`)**: Contains production configuration overrides (e.g., `FRONTEND_URL="https://readkar.prjly.org"`, `GOOGLE_REDIRECT_URI="https://api-readkar.prjly.org/api/auth/callback"`).

### Running in Development
1. Open `backend/.env` and ensure `APP_ENV="development"` is set.
2. Start the backend:
   ```bash
   cd backend
   uvicorn app.main:app --host 0.0.0.0 --port 4001 --reload
   ```

### Running in Production
1. Ensure your production environment variables (or `backend/.env.production`) contain the production URLs.
2. When deploying (or testing production locally), set the `APP_ENV` variable to `production`:
   ```bash
   cd backend
   APP_ENV=production uvicorn app.main:app --host 0.0.0.0 --port 4001
   ```
   *(Alternatively, just change `APP_ENV="production"` in `backend/.env`)*

## Frontend Configuration

The frontend uses Vite, which natively supports `.env.development` and `.env.production`.

1. **Development (`.env.development`)**: Loaded automatically when running `npm run dev`. Points `APP_URL` to `http://localhost:3000`.
2. **Production (`.env.production`)**: Loaded automatically when building the app (`npm run build`). Points `APP_URL` to `https://readkar.prjly.org` and configures production API keys.

### Running in Development
Vite will automatically proxy `/api` requests to the backend (defaults to `http://localhost:4001`).
```bash
cd frontend
npm run dev
```

### Running in Production
1. Build the frontend assets for production:
   ```bash
   cd frontend
   npm run build
   ```
2. The generated static files in `frontend/dist` can be served using any static hosting provider (e.g., Vercel, Netlify, Cloudflare Pages).
3. Make sure the backend CORS and redirects are set appropriately (by running backend in `production` mode as described above).
