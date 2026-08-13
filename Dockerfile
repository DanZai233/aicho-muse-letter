FROM node:22-alpine
WORKDIR /app
COPY server/package.json /app/package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY server/src /app/src
COPY web/dist /app/public
ENV NODE_ENV=production PORT=3004
EXPOSE 3004
CMD ["node", "src/index.js"]
