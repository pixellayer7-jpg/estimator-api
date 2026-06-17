# PixelLayer estimator-api — production container
FROM node:20-alpine

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/var/data

RUN mkdir -p /var/data && chown -R app:app /var/data /app

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "src/server.js"]
