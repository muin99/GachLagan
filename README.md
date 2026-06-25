# Gachlagan Keyboard

A basic, offline Bangla system keyboard for Android and iOS. It uses one shared
Keyman keyboard package on both platforms and the original open-source
jsAvroPhonetic rules for Avro-compatible Roman-to-Bangla typing.

Examples:

| Type | Output |
| --- | --- |
| `ami` | `আমি` |
| `bangladesh` | `বাংলাদেশ` |
| `ami banglay gan gai` | `আমি বাংলায় গান গাই` |

## Architecture

- `keyboard/` — the shared Keyman `.kmp` package and QWERTY touch layout.
- `mobile/android/` — Android InputMethodService based on Keyman’s open-source
  KMSample2 system-keyboard shell.
- `mobile/ios/` — iOS `UIInputViewController` extension based on Keyman’s
  open-source KMSample2 shell.
- `third_party/jsAvroPhonetic/` — an unmodified copy of the upstream Avro
  parser and its MPL-1.1 license.

Typing is processed entirely on-device. The Android manifest declares no
Internet permission. The iOS extension requests Open Access because Keyman’s
sample architecture shares the installed keyboard package with the containing
app through an App Group; this starter does not make network requests.

## Shared keyboard package

Requirements: Node.js 20 or newer.

```sh
npm install
npm run verify
```

`verify` runs the Avro tests, compiles `keyboard/build/avro_phonetic.kmp`, and
copies that package into both native targets. Re-run it whenever files under
`keyboard/source/` change.

## Android

Requirements: Android Studio, Android SDK 36, and JDK 21.

Open `mobile/android` in Android Studio or build from the command line:

```sh
cd mobile/android
./gradlew assembleDebug
```

Install the APK, open **Gachlagan Keyboard**, enable it in input-method
settings, and select **Gachlagan — বাংলা অভ্র** from the system keyboard picker.

## iOS

Requirements: full Xcode, an Apple development team, and Carthage.

```sh
brew install carthage
./scripts/bootstrap-ios.sh
open mobile/ios/KMSample2.xcodeproj
```

In Xcode, set your development team for both targets. If you change the bundle
identifier, change the App Group in both entitlements files and in the two
Swift assignments to `Manager.applicationGroupIdentifier`. Run the containing
app once so it installs the bundled Avro package, then enable the keyboard in
**Settings → General → Keyboard → Keyboards → Add New Keyboard**.

The checked-in Keyman Android AAR and iOS XCFramework are version 18.0.252.
Their source and license are linked in `THIRD_PARTY_NOTICES.md`.

## Current milestone

This first milestone intentionally contains only the essentials: a real system
keyboard, QWERTY and symbol layers, Avro Phonetic live composition, backspace,
space/commit behavior, and installation screens. Suggestions, autocorrect,
themes, telemetry, accounts, and cloud services are not included.
