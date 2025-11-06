# Usar imagen oficial de Node.js
FROM node:18-slim

# Establecer directorio de trabajo
WORKDIR /app

# Instalar Python y dependencias del sistema
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Crear entorno virtual de Python
RUN python3 -m venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# Copiar e instalar dependencias de Python primero (para aprovechar caché)
COPY requirements-api.txt ./
RUN pip install --no-cache-dir -r requirements-api.txt

# Copiar package.json y package-lock.json para instalar dependencias de Node
COPY package*.json ./
COPY servidor_api/package*.json ./servidor_api/

# Instalar dependencias de Node.js
RUN npm ci --only=production
RUN cd servidor_api && npm ci --only=production

# Copiar el resto del código de la aplicación
COPY . .

# Exponer puerto (aunque Render usa variable de entorno PORT)
EXPOSE 3000

# Usar variable de entorno PORT de Render
ENV PORT=3000

# Iniciar servidor
CMD ["node", "servidor_api/server.js"]