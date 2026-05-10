# Fly.io static-site image — VITE_TARGET=app build.
#
# Serves the register flow + account/rotate at:
#
#   https://app.zkqes.org
#
# Mirrors deploy/landing/Dockerfile (same builder shape) but with
# VITE_TARGET=app — pulls in the full SPA (register flow, mint flow,
# wallet rotation, the v2 ceremony console). The app target's entry
# chunk is heavier (~2.8 MB minified vs ~2.6 MB landing) — Fly's
# auto-stop machine handles either.
#
# Build-time env vars are baked into the bundle. Anything that needs
# to differ between staging and production (Sepolia vs Base mainnet
# chain pin, registry addresses, etc.) is threaded through the GitHub
# Actions deploy workflow as build args.

# ---- Stage 1: build ----
FROM node:20.19-alpine AS builder

WORKDIR /repo

# curl is needed by packages/web/scripts/generate-qtsp-summary.mjs to
# fetch the live EU LOTL + UA TL-EC XML during prebuild.
RUN apk add --no-cache curl

RUN corepack enable

# Full source copy before install — see deploy/landing/Dockerfile
# comment for the file: dep reason.
COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm -F @zkqes/sdk build

# Build args. Each one has a defensible default so a bare
# `flyctl deploy --config deploy/app/fly.toml --dockerfile deploy/app/Dockerfile`
# from a developer's machine produces a working bundle without `--build-arg`
# overrides. fly.toml's [build.args] takes precedence at deploy time when
# present.
#
# VITE_WALLETCONNECT_PROJECT_ID — required for RainbowKit; an empty
# string crashes the wagmi config at module load. The default below is
# the project's real WalletConnect Cloud project ID — public-by-design
# (every WC-enabled dapp ships theirs in the JS bundle), checked-in
# alongside packages/web/fly.toml:14.
ARG VITE_CHAIN=base-sepolia
ARG VITE_WALLETCONNECT_PROJECT_ID=6493cc804b966b9c739a7624c0d21d7c
ARG VITE_USE_MOCK_PROVER=
# V7 / V5.5 prover artifacts pumped to R2 (prove.zkqes.org/v5_5-stub/).
# Defaults pinned to the single-contributor ceremony output committed
# at packages/web/fixtures/circuits/urls.json. Override at deploy time
# via --build-arg when a fresh ceremony lands.
ARG VITE_V5_WASM_URL=https://prove.zkqes.org/v5_5-stub/ZkqesPresentationV5_5.wasm
ARG VITE_V5_ZKEY_URL=https://prove.zkqes.org/v5_5-stub/zkqes-v5_5-stub.zkey
ARG VITE_V5_WASM_SHA256=f70864efc6ce96adfd25a879725360efa0033dc360970352b3c1c5e7600758b9
ARG VITE_V5_ZKEY_SHA256=d79ecbe06958d850b2de92031504dc182463b013217829e8ccc75ae8ef7daedf
ENV VITE_TARGET=app \
    VITE_BASE=/ \
    VITE_CHAIN=${VITE_CHAIN} \
    VITE_WALLETCONNECT_PROJECT_ID=${VITE_WALLETCONNECT_PROJECT_ID} \
    VITE_USE_MOCK_PROVER=${VITE_USE_MOCK_PROVER} \
    VITE_V5_WASM_URL=${VITE_V5_WASM_URL} \
    VITE_V5_ZKEY_URL=${VITE_V5_ZKEY_URL} \
    VITE_V5_WASM_SHA256=${VITE_V5_WASM_SHA256} \
    VITE_V5_ZKEY_SHA256=${VITE_V5_ZKEY_SHA256}

RUN pnpm -F @zkqes/web build

# ---- Stage 2: serve ----
FROM nginx:1.27-alpine

COPY deploy/app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/packages/web/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
