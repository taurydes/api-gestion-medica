# ===========================
# 📦 Etapa 1 - Build
# ===========================
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependencias necesarias
RUN apt-get update && apt-get install -y python3 build-essential

# Copiar package.json e instalar deps
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copiar código fuente
COPY . .

# Compilar TS
RUN npm run build


# ===========================
# 🚀 Etapa 2 - Runtime
# ===========================
FROM node:20-slim

WORKDIR /app

# Instalar FFmpeg + ffprobe
RUN apt-get update && apt-get install -y ffmpeg

# Variables del entorno
ENV NODE_ENV=production
ENV TZ=America/Caracas

# Copiar dependencias y dist
COPY --from=builder /app/package*.json ./
RUN npm install --only=production --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/logs/views ./src/logs/views

# Crear directorio para uploads
RUN mkdir -p ./uploads

# Exponer puerto
ARG PORT=7008
ENV PORT=${PORT}
EXPOSE ${PORT}

# Iniciar app
CMD ["node", "dist/main.js"]
