FROM node:20-alpine
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

COPY client/package*.json ./client/
RUN cd client && npm install
COPY client ./client
RUN cd client && npm run build

COPY server ./server

EXPOSE 8080
CMD ["node", "server/server.js"]
