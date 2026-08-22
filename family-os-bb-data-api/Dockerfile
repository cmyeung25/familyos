FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    FAMILY_OS_BB_DATA_API_PORT=8788

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

COPY --chown=node:node lib.mjs mapping.mjs server.mjs migrate.mjs ./

USER node

EXPOSE 8788

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8788/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.mjs"]
