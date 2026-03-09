# ===========================
# 📦 Etapa 1 - Dependencias
# ===========================
FROM node:20-slim AS deps
WORKDIR /app

# Herramientas nativas para compilar módulos (bcrypt, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copiar manifiestos primero para aprovechar la caché de capas Docker.
# Solo se reinstalan dependencias si cambia package*.json.
COPY package*.json ./
RUN npm ci --legacy-peer-deps --no-audit


# ===========================
# 🔨 Etapa 2 - Compilación
# ===========================
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Compilar TypeScript
RUN npm run build


# ===========================
# 🚀 Etapa 3 - Runtime
# ===========================
FROM node:20-slim AS runtime
WORKDIR /app

# FFmpeg + ffprobe para procesamiento de video/archivos
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Variables de entorno de producción
ENV NODE_ENV=production
ENV TZ=America/Caracas

# Instalar solo dependencias de producción (sin devDependencies)
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps --no-audit

# Copiar artefactos del build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/logs/views ./src/logs/views

# Crear directorio para uploads (persistido vía volume en docker-compose)
RUN mkdir -p ./uploads

# Puerto configurado por variable de entorno (default: 8008)
ARG PORT=8008
ENV PORT=${PORT}
EXPOSE 8008

CMD ["node", "dist/main.js"]
