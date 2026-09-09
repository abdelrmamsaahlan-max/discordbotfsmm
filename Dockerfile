FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY . .

CMD ["node", "src/index-v8-1.js"]
