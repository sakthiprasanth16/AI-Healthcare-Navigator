# ── AI Healthcare Cost Navigator — Frontend Dockerfile ─────────────────────
# Multi-stage: Vite build → Nginx static serve (production)

# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Install deps first (cached layer unless package*.json changes)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build.
# Frontend calls relative path "/api/..." (see lib/api.ts baseURL) — no
# VITE_API_URL build arg needed, since Nginx proxies /api to the backend.
COPY . .
RUN npm run build

# ── Stage 2: Serve with Nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

# Custom nginx config: SPA fallback (React Router) + gzip
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]