#!/usr/bin/env bash
#
# Build and push etiquetador-web to GitHub Container Registry.
#
# Required env:
#   IMAGE_OWNER   your GitHub user or org (e.g. "danielromero")
#
# Optional env:
#   IMAGE_REGISTRY  default: ghcr.io
#   IMAGE_NAME      default: etiquetador-web
#   IMAGE_TAG       default: git describe --tags --always --dirty (falls back to "latest")
#   GHCR_USER       default: prompted interactively if $GHCR_TOKEN is unset
#   GHCR_TOKEN      if set, used non-interactively via --password-stdin
#   PUSH_LATEST     default: 0 → push :latest only on an exact tag match.
#                             Set to 1 to force.
#   PLATFORM        default: linux/amd64,linux/arm64 (multi-arch manifest list).
#                             Override for a single target — e.g. PLATFORM=linux/amd64
#                             when the prod server is x86_64. Note: --load only
#                             supports a single platform, so single-target builds
#                             use --load and multi-arch uses --push directly from
#                             buildx.
#
# The data services (postgres/redis/minio/meilisearch) are NOT pushed here.
# They come from upstream images and are started on the prod host via
# docker-compose.prod.yml / docker-compose.data.yml.
#
# Requires: docker (20.10+ for buildkit cache, any recent version otherwise).

set -euo pipefail

# ----- Config ----------------------------------------------------------------
: "${IMAGE_REGISTRY:=ghcr.io}"
: "${IMAGE_NAME:=etiquetador-web}"
: "${PUSH_LATEST:=0}"
: "${PLATFORM:=linux/amd64,linux/arm64}"

if [ -z "${IMAGE_OWNER:-}" ]; then
  printf '\033[1;31merror:\033[0m IMAGE_OWNER is empty. Set it to your GitHub user/org.\n' >&2
  exit 1
fi

if [ -z "${IMAGE_TAG:-}" ]; then
  if command -v git >/dev/null 2>&1; then
    IMAGE_TAG="$(git -C "$(cd "$(dirname "$0")/.." && pwd)" describe --tags --always --dirty 2>/dev/null || echo latest)"
  else
    IMAGE_TAG="latest"
  fi
fi

FULL_IMAGE="${IMAGE_REGISTRY}/${IMAGE_OWNER}/${IMAGE_NAME}"

# ----- Helpers ---------------------------------------------------------------
say()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# ----- Sanity checks ---------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "docker not found in PATH"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

[ -f Dockerfile.web ]    || die "Dockerfile.web not found at repo root ($REPO_ROOT)"
[ -f pnpm-lock.yaml ]    || die "pnpm-lock.yaml missing — pnpm workspace not initialised"

# ----- Login -----------------------------------------------------------------
say "Logging into ${IMAGE_REGISTRY}"
if [ -n "${GHCR_TOKEN:-}" ]; then
  echo "$GHCR_TOKEN" | docker login "$IMAGE_REGISTRY" \
    -u "${GHCR_USER:-${IMAGE_OWNER}}" --password-stdin
else
  say "GHCR_TOKEN not set — falling back to interactive login"
  docker login "$IMAGE_REGISTRY" -u "${GHCR_USER:-${IMAGE_OWNER}}"
fi

# ----- Build -----------------------------------------------------------------
REVISION="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
CREATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

say "Building ${FULL_IMAGE}:${IMAGE_TAG} (platform=${PLATFORM})"

# Single-target builds use --load (image lands in the local docker daemon
# so `docker push` below can pick it up). Multi-arch builds cannot --load,
# so we go straight from buildx to the registry with --push and both
# tags (the SHA tag and :latest) get pushed in one shot.
if [[ "$PLATFORM" == *","* ]]; then
  docker buildx build \
    --file Dockerfile.web \
    --platform "$PLATFORM" \
    --tag "${FULL_IMAGE}:${IMAGE_TAG}" \
    --tag "${FULL_IMAGE}:latest" \
    --label "org.opencontainers.image.source=https://github.com/${IMAGE_OWNER}/etiquetador" \
    --label "org.opencontainers.image.revision=${REVISION}" \
    --label "org.opencontainers.image.created=${CREATED}" \
    --push \
    "$REPO_ROOT"

  if [ "${IMAGE_TAG}" = "latest" ]; then
    say "Pushed multi-arch :latest"
  else
    say "Pushed multi-arch ${IMAGE_TAG} and :latest"
  fi
else
  docker buildx build \
    --file Dockerfile.web \
    --platform "$PLATFORM" \
    --tag "${FULL_IMAGE}:${IMAGE_TAG}" \
    --tag "${FULL_IMAGE}:latest" \
    --label "org.opencontainers.image.source=https://github.com/${IMAGE_OWNER}/etiquetador" \
    --label "org.opencontainers.image.revision=${REVISION}" \
    --label "org.opencontainers.image.created=${CREATED}" \
    --load \
    "$REPO_ROOT"

  say "Pushing ${FULL_IMAGE}:${IMAGE_TAG}"
  docker push "${FULL_IMAGE}:${IMAGE_TAG}"

  if [ "${IMAGE_TAG}" != "latest" ]; then
    should_push_latest="$PUSH_LATEST"
    if [ "$should_push_latest" = "0" ] && command -v git >/dev/null 2>&1; then
      if git -C "$REPO_ROOT" describe --tags --exact-match >/dev/null 2>&1; then
        should_push_latest=1
      fi
    fi
    if [ "$should_push_latest" = "1" ]; then
      say "Also pushing :latest"
      docker push "${FULL_IMAGE}:latest"
    else
      say "Skipping :latest (set PUSH_LATEST=1 to force, or tag the commit to push automatically)"
    fi
  fi
fi

printf '\n\033[1;32m==>\033[0m Done.\n'
printf '\033[1;32m==>\033[0m Image: %s:%s\n' "$FULL_IMAGE" "$IMAGE_TAG"