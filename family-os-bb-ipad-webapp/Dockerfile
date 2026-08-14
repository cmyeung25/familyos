FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    NODE_OPTIONS=--use-system-ca \
    FAMILY_OS_BB_IPAD_PORT=8790

WORKDIR /app

COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node public ./public

USER node

EXPOSE 8790

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8790/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.mjs"]
