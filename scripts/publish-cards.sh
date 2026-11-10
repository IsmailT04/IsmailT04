#!/bin/zsh
# Redraws the README cards and publishes them to the `output` branch.
# Runs daily from the launchd agent com.ismailt04.profile-cards, or by hand:
#   scripts/publish-cards.sh
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

GH_USER="IsmailT04"
REPO_DIR="${0:A:h:h}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "--- $(date '+%Y-%m-%d %H:%M:%S')"
GITHUB_TOKEN="$(gh auth token)" node "$REPO_DIR/scripts/cards.mjs" "$GH_USER" "$WORK"

cd "$WORK"
git init -q -b output
git add .
git -c user.name="İsmail Temüroğlu" -c user.email="116907755+${GH_USER}@users.noreply.github.com" \
  commit -q -m "Update profile cards"
# The output branch only ever holds the latest cards, so it is replaced each run.
git -c credential.helper= -c credential.helper='!gh auth git-credential' \
  push -q -f "https://github.com/${GH_USER}/${GH_USER}.git" output
echo "published"
