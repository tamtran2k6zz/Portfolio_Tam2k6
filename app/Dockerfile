FROM node:24.19.0-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p /app/logs && chown node:node /app/logs
COPY --chown=node:node src ./src
COPY --chown=node:node views ./views
COPY --chown=node:node public ./public
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
