#!/usr/bin/env bash
set -eo pipefail

# Required env: PKG_NAME, PKG_DIR, CHANNEL (stable|canary|alpha), VERSION, TAG, REPO
# Runs from the repo root. Writes /tmp/changelog.md.

case "$CHANNEL" in
  stable)
    # Strict semver only: PKG_NAME@X.Y.Z — excludes any prerelease suffix
    LAST_TAG=$(git tag --list "${PKG_NAME}@*" --sort=-version:refname \
      | grep -E '^.+@[0-9]+\.[0-9]+\.[0-9]+$' \
      | head -n1 || true)
    ;;
  canary)
    LAST_TAG=$(git tag --list "${PKG_NAME}@*-canary.*" --sort=-version:refname \
      | head -n1 || true)
    ;;
  alpha)
    LAST_TAG=$(git tag --list "${PKG_NAME}@*-alpha.*" --sort=-version:refname \
      | head -n1 || true)
    ;;
esac

if [ -n "$LAST_TAG" ]; then
  COMMITS=$(git log "${LAST_TAG}..HEAD" --pretty=format:"%s (%h)" -- "${PKG_DIR}/")
else
  COMMITS=$(git log --pretty=format:"%s (%h)" -- "${PKG_DIR}/")
fi

if [ -z "$COMMITS" ]; then
  echo "- Release ${VERSION}" > /tmp/changelog.md
else
  # Group commits by conventional commit type
  FEAT="" FIX="" PERF="" REFACTOR="" DOCS="" TEST="" BUILD="" STYLE="" CI="" CHORE="" OTHER=""

  while IFS= read -r line; do
    case "$line" in
      feat*)    FEAT="${FEAT}\n- ${line}" ;;
      fix*)     FIX="${FIX}\n- ${line}" ;;
      perf*)    PERF="${PERF}\n- ${line}" ;;
      refactor*) REFACTOR="${REFACTOR}\n- ${line}" ;;
      docs*)    DOCS="${DOCS}\n- ${line}" ;;
      test*)    TEST="${TEST}\n- ${line}" ;;
      build*)   BUILD="${BUILD}\n- ${line}" ;;
      style*)   STYLE="${STYLE}\n- ${line}" ;;
      ci*)      CI="${CI}\n- ${line}" ;;
      chore*)   CHORE="${CHORE}\n- ${line}" ;;
      *)        OTHER="${OTHER}\n- ${line}" ;;
    esac
  done <<< "$COMMITS"

  {
    [ -n "$FEAT" ]     && printf "### 🚀 Features\n%b\n\n" "$FEAT"
    [ -n "$FIX" ]      && printf "### 🐛 Bug Fixes\n%b\n\n" "$FIX"
    [ -n "$PERF" ]     && printf "### ⚡ Performance\n%b\n\n" "$PERF"
    [ -n "$REFACTOR" ] && printf "### ♻️ Refactors\n%b\n\n" "$REFACTOR"
    [ -n "$DOCS" ]     && printf "### 📚 Documentation\n%b\n\n" "$DOCS"
    [ -n "$TEST" ]     && printf "### 🧪 Tests\n%b\n\n" "$TEST"
    [ -n "$BUILD" ]    && printf "### 🏗️ Build\n%b\n\n" "$BUILD"
    [ -n "$STYLE" ]    && printf "### 🎨 Style\n%b\n\n" "$STYLE"
    [ -n "$CI" ]       && printf "### 🔧 CI\n%b\n\n" "$CI"
    [ -n "$CHORE" ]    && printf "### 🧹 Chores\n%b\n\n" "$CHORE"
    [ -n "$OTHER" ]    && printf "### 📝 Other\n%b\n\n" "$OTHER"
  } > /tmp/changelog.md
fi

# Truncate if exceeding GitHub Release body limit (125 000 chars)
MAX_CHARS=124000
if [ "$(wc -c < /tmp/changelog.md)" -gt "$MAX_CHARS" ]; then
  head -c "$MAX_CHARS" /tmp/changelog.md > /tmp/changelog_trimmed.md
  printf "\n\n---\n*Changelog truncated — see [full diff](https://github.com/%s/compare/%s...%s) for all changes.*\n" \
    "$REPO" \
    "${LAST_TAG:-$(git rev-list --max-parents=0 HEAD | head -1)}" \
    "$TAG" >> /tmp/changelog_trimmed.md
  mv /tmp/changelog_trimmed.md /tmp/changelog.md
fi
