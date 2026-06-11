FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client ripgrep tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/family-os-telegram-bot
COPY family-os-telegram-bot/package.json family-os-telegram-bot/package-lock.json ./
ENV NODE_OPTIONS=--use-system-ca
RUN npm config set cafile /etc/ssl/certs/ca-certificates.crt \
  && npm config set strict-ssl false \
  && npm install --omit=dev --no-fund --no-audit

WORKDIR /app
COPY AGENTS.md README.md ./
COPY family-os-apps-script ./family-os-apps-script
COPY family-os-telegram-bot ./family-os-telegram-bot
COPY plugins-staging ./plugins-staging
COPY docker ./docker
COPY instances/example ./instances/example

RUN mkdir -p /app/.agents/skills /data/instance/config /data/instance/state /data/instance/logs /data/instance/memory /data/instance/runtime/knowledge

ENV NODE_ENV=production \
    NODE_OPTIONS=--use-system-ca \
    FAMILY_OS_WORKSPACE=/app \
    FAMILY_OS_INSTANCE_ROOT=/data/instance \
    FAMILY_OS_CONFIG_ROOT=/data/instance/config \
    FAMILY_OS_STATE_ROOT=/data/instance/state \
    FAMILY_OS_LOGS_ROOT=/data/instance/logs \
    FAMILY_OS_CODEX_HOME=/data/instance/.codex-home \
    FAMILY_OS_SKILLS_ROOT=/app/.agents/skills \
    FAMILY_OS_SERVICE_MODE=bot

ENTRYPOINT ["tini", "--", "node", "/app/docker/start-family-os.mjs"]
CMD ["bot"]
