# =================================================================
# Stage 1: Build React Frontend
# =================================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# =================================================================
# Stage 2: Python Backend & Final Monolith Container
# =================================================================
FROM python:3.11-slim AS runner

WORKDIR /app

# Install system dependencies (build-essential for C extensions and curl for diagnostics)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY backend/ ./backend

# Copy built frontend assets to static dist directory
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create persistent data directory
RUN mkdir -p /app/data

# Environment defaults
ENV PYTHONUNBUFFERED=1 \
    DATA_DIR=/app/data \
    DATABASE_URL=sqlite+aiosqlite:////app/data/app.db \
    PORT=8000 \
    HOST=0.0.0.0

EXPOSE 8000

# Mount persistent volume on /app/data
VOLUME ["/app/data"]

# Run the FastAPI server
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
