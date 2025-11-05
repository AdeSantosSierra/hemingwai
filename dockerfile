# Fase 1: Entorno de construcción y ejecución
# Usamos una imagen oficial de Node.js que viene con un sistema operativo Debian
FROM node:18-slim

# Establecemos el directorio de trabajo dentro del contenedor
WORKDIR /app

# Instalar Python y dependencias del sistema
# - python3 y python3-pip para el intérprete y el gestor de paquetes
# - git para dependencias que puedan venir de repositorios
RUN apt-get update && apt-get install -y python3 python3-pip git --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Crear y activar un entorno virtual para Python
RUN python3 -m venv .venv
ENV PATH="/app/.venv/bin:$PATH"

# Instalar dependencias de Python
# Copiamos primero el archivo de requisitos para aprovechar el caché de Docker
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Instalar dependencias de Node.js del backend
# Copiamos los package.json para aprovechar el caché
COPY package.json package-lock.json ./
COPY servidor_api/package.json servidor_api/package-lock.json ./servidor_api/
RUN npm install
RUN npm install --prefix servidor_api

# Copiar el resto del código de la aplicación
COPY . .

# Exponer el puerto en el que corre el servidor de la API
EXPOSE 3000

# Comando para iniciar el servidor de la API cuando el contenedor se inicie
# Esto ejecutará el server.js del backend
CMD ["node", "servidor_api/server.js"]
