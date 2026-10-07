#!/usr/bin/env bash
set -eo pipefail

# Required env: BUMP (patch|minor|major), CHANNEL (beta|latest)
# Runs from the package directory. Writes the next version to package.json.
#
# package.json holds the last stable version (only latest commits it):
# - latest: next version, e.g. 3.1.0
# - beta:   next version + the next candidate number from the git tags, e.g. 3.1.0-rc.2

IFS='.' read -r MAJOR MINOR PATCH <<< "$(jq -r .version package.json)"

case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
  *)
    echo "::error::Unknown BUMP '$BUMP' (patch|minor|major)"
    exit 1
    ;;
esac

VERSION="${MAJOR}.${MINOR}.${PATCH}"

case "$CHANNEL" in
  latest) ;;
  beta)
    PKG_NAME=$(jq -r .name package.json)
    LAST_RC=$(git tag --list "${PKG_NAME}@${VERSION}-rc.*" | sed 's/.*-rc\.//' | sort -n | tail -n1)
    VERSION="${VERSION}-rc.$(( ${LAST_RC:-0} + 1 ))"
    ;;
  *)
    echo "::error::Unknown CHANNEL '$CHANNEL' (beta|latest)"
    exit 1
    ;;
esac

jq --arg v "$VERSION" '.version = $v' package.json > tmp.json && mv tmp.json package.json
