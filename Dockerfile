FROM node:24-slim

# Install Python 3 and curl for scraper.py and container healthchecks
RUN apt-get update && apt-get install -y python3 python3-pip curl --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy application source
COPY . .

# Build production bundle
RUN npm run build

EXPOSE 3000

# Persist SQLite WAL database file across container restarts
VOLUME ["/app/podconnect_leads.db"]

# Run Express & API server
CMD ["npm", "start"]
