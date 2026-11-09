# The Criteria Chat demo: the app's source tree with its built UI (demos/criteria/build.sh → site/)
# behind server.mjs. The build context is demos/:
#   docker build -t jmborrill-criteria-demo -f demos/criteria/Dockerfile demos
# Node runs the proxy; uv installs Python 3.13 and the backend's locked dependencies.
FROM node:22-bookworm-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR=/opt/python UV_NO_CACHE=1 PORT=8080
WORKDIR /app
COPY lib ./lib
COPY criteria/site ./criteria/site
COPY criteria/server.mjs ./criteria/server.mjs
RUN cd criteria/site/backend && uv sync --locked --no-dev && chmod -R a+rX /opt/python
USER node
EXPOSE 8080
CMD ["node", "criteria/server.mjs"]
