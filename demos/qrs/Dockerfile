# The Quant Research Studio demo service: the unmodified QRS engine and studio from the pinned
# commit, behind server.py. Build with demos/qrs/build.sh, which supplies the "app" build context.
# Run with QRS_FRAME_ANCESTORS set to the portfolio's origin, and without outbound network.
FROM node:22-bookworm-slim AS studio
WORKDIR /qrs/apps/studio
COPY --from=app apps/studio ./
# build_ca: an optional CA for a build network that intercepts TLS (build.sh's BUILD_CA). A secret
# mount, so it is never part of the image.
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi \
 && npm ci --no-audit --no-fund && npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_PYTHON_DOWNLOADS=never UV_NO_CACHE=1 \
    HOST=0.0.0.0 PORT=8765 QRS_DEMO_HOME=/tmp/qrs-demo
WORKDIR /qrs
COPY --from=app / ./
# uv at the version QRS's CI pins; it installs the locked environment and is then removed.
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export PIP_CERT=/run/secrets/build_ca SSL_CERT_FILE=/run/secrets/build_ca; fi \
 && pip install --no-cache-dir uv==0.11.32 \
 && uv sync --frozen --no-dev \
 && pip uninstall --yes uv \
 && useradd --uid 1000 --no-create-home qrs
COPY --from=studio /qrs/apps/studio/dist apps/studio/dist
COPY server.py /app/server.py
USER qrs
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=3s CMD ["/qrs/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/healthz')"]
CMD ["/qrs/.venv/bin/python", "/app/server.py"]
