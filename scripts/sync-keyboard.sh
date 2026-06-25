#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package="$repo_root/keyboard/build/avro_phonetic.kmp"

if [[ ! -f "$package" ]]; then
  echo "Missing $package. Run npm run build:keyboard first." >&2
  exit 1
fi

install -m 0644 "$package" "$repo_root/mobile/android/app/src/main/assets/avro_phonetic.kmp"
install -m 0644 "$package" "$repo_root/mobile/ios/Keyboards/avro_phonetic.kmp"
echo "Synced avro_phonetic.kmp to Android and iOS."
