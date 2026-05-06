# Fly.io static-site image — VITE_TARGET=landing build.
#
# Serves the pre-ceremony hero, ceremony pages (status / contribute /
# verify), integrations docs, and the legacy ua/* surfaces at:
#
#   https://zkqes.org           (apex)
#   https://ceremony.zkqes.org  (alias — same Fly app, same dist)
#
# Sister Fly app:
#   deploy/app/      VITE_TARGET=app    → app.zkqes.org   (register flow SPA)
#
# Two-stage build:
#   Stage 1 (builder)   pnpm install + build the SPA
#   Stage 2 (nginx)     copy dist/ into a tiny nginx:alpine image
#
# The runtime image is ~25 MB (nginx:alpine + dist/). Fly's auto-stop
# machine pricing applies — at the volumes this surface sees pre-launch
# the machine sleeps almost continuously and the bill is effectively $0.

# ---- Stage 1: build ----
FROM node:20.19-alpine AS builder

WORKDIR /repo

# pnpm — pinned to the version in packageManager (cf. package.json).
# Corepack is the Node-bundled installer; using it avoids a global npm
# install of pnpm + matches the version pin.
# curl is needed by packages/web/scripts/generate-qtsp-summary.mjs to
# fetch the live EU LOTL + UA TL-EC XML during prebuild. node:alpine
# omits curl by default.
RUN apk add --no-cache curl

RUN corepack enable

# Copy the full source tree before install. Reason: the workspace
# lockfile pins a `file:packages/web/test/fixtures/zkqes-cli-0.5.2-
# pre.tgz` dependency (the bundled CLI tarball used by the e2e
# fallback tests), and `pnpm install --frozen-lockfile` requires the
# file present at install time — even with --ignore-scripts. The
# usual "early COPY package.json + late COPY ." cache trick doesn't
# work here for that reason.
COPY . .

# Install with lockfile pin. --frozen-lockfile fails the build if
# pnpm-lock.yaml is stale, which is what we want — drift between
# repo state and what's deployed is the kind of thing that causes
# "works on my machine" outages.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build dependencies the web package consumes via the workspace alias.
# packages/web's vite import-analysis pulls @zkqes/sdk from `dist/` —
# missing dist surfaces as 27/40 vite "Failed to resolve import" errors.
RUN pnpm -F @zkqes/sdk build

# Build the landing target SPA.
#
# VITE_BASE=/ — custom-domain root, not /repo-name/ (this is Fly,
# not GH-Pages-on-org-domain).
#
# VITE_CEREMONY_STATUS_URL — absolute URL of the ceremony status feed.
# UNSET deliberately: the SPA falls through to the bundled
# `/ceremony/status.json` fixture served by this same nginx container,
# which is sufficient pre-ceremony (round=0, contributors=[]). Once the
# real R2 origin (prove.zkqes.org) is live post-§9.4, set the build arg
# at deploy time. Don't hardcode a URL that doesn't resolve — it forces
# the SPA into the "FEED DOWN" error branch even when same-origin data
# is right there.
ARG VITE_CHAIN=sepolia
ENV VITE_TARGET=landing \
    VITE_BASE=/ \
    VITE_CHAIN=${VITE_CHAIN}

RUN pnpm -F @zkqes/web build

# ---- Stage 2: serve ----
FROM nginx:1.27-alpine

# Default nginx config doesn't do SPA fallback (serve index.html for
# unknown paths) — the Tanstack Router routes (/ceremony/contribute,
# /ua/cli, /v5/registerV5, etc.) need that fallback or they 404 on
# direct navigation / page reload.
COPY deploy/landing/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /repo/packages/web/dist /usr/share/nginx/html

# Fly's default health-check probes :8080 over HTTP. Match it; the
# default :80 forces an extra port mapping. EXPOSE is documentation;
# the actual binding is in nginx.conf.
EXPOSE 8080

# Run as the nginx user (non-root) for defense-in-depth. The
# nginx:alpine image already creates the user; we just drop into it.
# `daemon off` is required because Fly's machine runtime expects PID 1
# to stay in the foreground.
CMD ["nginx", "-g", "daemon off;"]
