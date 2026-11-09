# The AI Workflow Studio demo service: the unmodified engine and studio from the pinned commit,
# behind gateway.mjs, with the example workspace in seed/. Build with demos/aiws/build.sh, which
# supplies the "app" build context. Run with AIWS_FRAME_ANCESTORS set to the portfolio's origin.
FROM node:22-bookworm-slim AS build
WORKDIR /aiws
COPY --from=app / ./
# build_ca: an optional CA for a build network that intercepts TLS (build.sh's BUILD_CA). A secret
# mount, so it is never part of the image.
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi \
 && npm ci --no-audit --no-fund \
 && npm run build:packages \
 && npm run build -w studio \
 && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production AIWS_DIR=/aiws HOST=0.0.0.0 PORT=8080
COPY --from=build /aiws /aiws
COPY gateway.mjs COMMIT /app/
COPY seed /app/seed
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "/app/gateway.mjs"]
