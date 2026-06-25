#!/usr/bin/env bash
set -euo pipefail

ios_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

xcodebuild \
  -project "$ios_root/KMSample2.xcodeproj" \
  -scheme KMSample2 \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath "$ios_root/DerivedData" \
  CODE_SIGNING_ALLOWED=NO \
  build
