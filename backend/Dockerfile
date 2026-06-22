# ── AI Healthcare Cost Navigator — Backend Dockerfile ──────────────────────
# FastAPI + Motor (MongoDB Atlas) + LangGraph + Gemini + PyMuPDF + httpx

FROM python:3.11-slim AS base

# Prevent .pyc files, enable unbuffered stdout (so `docker logs` shows prints live)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps:
#   - build-essential: some packages (e.g. PyMuPDF) need a compiler if no wheel matches
#   - libgl1 / libglib2.0-0: required by PyMuPDF (fitz) for image/PDF rendering
#   - curl: used by the HEALTHCHECK below
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (separate layer — cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY seed.py seed_pharmacies.py seed_spending.py ./

# Non-root user for security
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Production: multiple workers. For dev, override command in docker-compose.yml with --reload
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
