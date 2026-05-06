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
ARG VITE_WALLETCONNECT_PROJECT_ID=c46544572774f96e20db476d5cc565be
ARG VITE_USE_MOCK_PROVER=
ENV VITE_TARGET=app \
    VITE_BASE=/ \
    VITE_CHAIN=${VITE_CHAIN} \
    VITE_WALLETCONNECT_PROJECT_ID=${VITE_WALLETCONNECT_PROJECT_ID} \
    VITE_USE_MOCK_PROVER=${VITE_USE_MOCK_PROVER}

RUN pnpm -F @zkqes/web build

# ---- Stage 2: serve ----
FROM nginx:1.27-alpine

COPY deploy/app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/packages/web/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
