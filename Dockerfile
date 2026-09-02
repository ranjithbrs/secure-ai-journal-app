# Step 1: Build Frontend
FROM node:20-alpine AS build-frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Step 2: Production Server
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=build-frontend /app/dist ./dist
COPY --from=build-frontend /app/server ./server

ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server/index.js"]
