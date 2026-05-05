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

RUN corepack enable

# Full source copy before install — see deploy/landing/Dockerfile
# comment for the file: dep reason.
COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm -F @zkqes/sdk build

# Build args. Each one has a defensible default for "build for
# Sepolia preview"; production builds override via the GH Action.
#
# VITE_WALLETCONNECT_PROJECT_ID — required for RainbowKit; an empty
# string crashes the wagmi config at module load (see the dev-server
# blank-page fix from earlier). The CI must inject the real value via
# secret on production builds.
ARG VITE_CHAIN=sepolia
ARG VITE_WALLETCONNECT_PROJECT_ID=
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
