# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=26

FROM node:26-bookworm-slim AS package
ARG PNPM_VERSION=12
RUN apt-get update && \
  apt-get install --no-install-recommends --yes libatomic1 && \
  rm -rf /var/lib/apt/lists/*
RUN npm install --global "pnpm@${PNPM_VERSION}" && npm cache clean --force
ENV CI=true
WORKDIR /source
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json LICENSE README.md ./
COPY scripts ./scripts
COPY src ./src
COPY tests ./tests
RUN pnpm install --frozen-lockfile
RUN mkdir -p /artifacts && pnpm pack --out /artifacts/oxlint-plugin-legibility.tgz

FROM node:${NODE_VERSION}-bookworm-slim AS test
ARG OXLINT_VERSION=1.78.0
RUN apt-get update && \
  apt-get install --no-install-recommends --yes libatomic1 && \
  rm -rf /var/lib/apt/lists/*
ENV CI=true
WORKDIR /workspace
RUN mkdir -p /workspace/tmp && chown node:node /workspace /workspace/tmp
ENV TMPDIR=/workspace/tmp
COPY --from=package /artifacts /artifacts
COPY --chown=node:node tests/e2e/fixtures/package.consumer.json ./package.json
USER node
RUN npm install --save-dev --save-exact --no-audit --no-fund \
  "oxlint-plugin-legibility@file:/artifacts/oxlint-plugin-legibility.tgz" \
  "oxlint@${OXLINT_VERSION}"
COPY --chown=node:node tests/fixtures/oxlint ./tests/fixtures/oxlint
COPY --chown=node:node tests/e2e/scripts/test.sh ./tests/e2e/scripts/test.sh
ENTRYPOINT ["bash"]
CMD ["tests/e2e/scripts/test.sh"]
