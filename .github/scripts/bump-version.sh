#!/usr/bin/env bash
set -eo pipefail

# Required env: BUMP (patch|minor|major), CHANNEL (stable|canary|alpha)
# Runs from the package directory. Writes GITHUB_OUTPUT + GITHUB_STEP_SUMMARY.

CURRENT=$(jq -r .version package.json)

# Split current version (strip any existing prerelease suffix)
IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT%%-*}"

case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

BASE="${MAJOR}.${MINOR}.${PATCH}"

case "$CHANNEL" in
  stable)
    VERSION="${BASE}"
    NPM_TAG="latest"
    PRERELEASE="false"
    ;;
  canary|alpha)
    SHORT_SHA="${GITHUB_SHA:0:7}"
    DATE=$(date +%Y%m%d)
    VERSION="${BASE}-${CHANNEL}.${DATE}.${SHORT_SHA}"
    NPM_TAG="${CHANNEL}"
    PRERELEASE="true"
    ;;
esac

jq --arg v "$VERSION" '.version = $v' package.json > tmp.json && mv tmp.json package.json
PKG_NAME=$(jq -r .name package.json)
TAG="${PKG_NAME}@${VERSION}"

echo "version=$VERSION" >> "$GITHUB_OUTPUT"
echo "tag=$TAG" >> "$GITHUB_OUTPUT"
echo "npm-tag=$NPM_TAG" >> "$GITHUB_OUTPUT"
echo "prerelease=$PRERELEASE" >> "$GITHUB_OUTPUT"
echo "pkg-name=$PKG_NAME" >> "$GITHUB_OUTPUT"

{
  echo "### Version Bump"
  echo "| Field | Value |"
  echo "|-------|-------|"
  echo "| Package | $PKG_NAME |"
  echo "| Previous | $CURRENT |"
  echo "| New | $VERSION |"
  echo "| Tag | $TAG |"
  echo "| NPM Tag | $NPM_TAG |"
} >> "$GITHUB_STEP_SUMMARY"
