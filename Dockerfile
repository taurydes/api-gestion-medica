# ===========================
# 📦 Etapa 1 - Build (compilación)
# ===========================
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar package.json e instalar dependencias
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copiar todo el código fuente
COPY . .

# Compilar TypeScript
RUN npm run build

# ===========================
# 🚀 Etapa 2 - Runtime (producción)
# ===========================
FROM node:20-alpine

WORKDIR /app

# Variables de entorno básicas
ENV NODE_ENV=production
ENV TZ=America/Caracas

# Copiar solo lo necesario desde la etapa anterior
COPY --from=builder /app/package*.json ./
RUN npm install --only=production --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/logs/views ./src/logs/views

# Crear directorio para uploads (se montará como volumen)
RUN mkdir -p ./uploads

# Exponer el puerto
ARG PORT=7008
ENV PORT=${PORT}
EXPOSE ${PORT}

# Comando de inicio
CMD ["node", "dist/main.js"]
