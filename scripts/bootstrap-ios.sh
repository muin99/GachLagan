#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v carthage >/dev/null 2>&1; then
  echo "Carthage is required. Install it with: brew install carthage" >&2
  exit 1
fi

cd "$repo_root"
carthage bootstrap --platform iOS --use-xcframeworks
echo "iOS dependencies are ready in $repo_root/Carthage/Build."
