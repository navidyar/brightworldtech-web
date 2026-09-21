FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends cups-client fonts-dejavu-core fonts-liberation fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]