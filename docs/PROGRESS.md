# Work log

Current release: `2.0.1`, prepared on `release/v2.0.1` as a signed Android update. Source and CI are hosted at `muin99/GachLagan`. Artifact-specific verification is recorded in the GitHub Release.

## Implemented in this branch

- Shared private composer with visible plaintext draft; ciphertext only enters the host app after Encrypt & insert.
- Compact local message reader, settings, Avro typing, emoji, one-shot Shift/Caps Lock, and unkeyed encoding modes. Copying a recognized message opens the reader automatically by default; a protected saved key is loaded on demand, while a missing key prompts once. The toolbar keeps a manual clipboard fallback.
- In-keyboard mode chooser in place of the unreliable native dropdown; full-height settings until key entry is focused. Ten explicitly public encoding modes plus one authenticated private mode.
- Length-checked GK2/GE2 wrappers around new inserts. Up to 16 adjacent frames can be copied and opened as one selection; a Paste action allows bounded nested encryption. Legacy standalone GK1/GE1 remains readable. Failed authentication in any frame reveals no batch plaintext.
- Versioned authenticated encryption using platform AES-256-GCM. Generated 256-bit shared keys are the recommended mode; custom passphrases are supported with PBKDF2-HMAC-SHA256 (600,000 iterations).
- Native crypto implementations for Android and iOS plus a browser implementation for interop and interface tests.

## Verified on 2026-09-25

| Check | Result | Scope |
| --- | --- | --- |
| `npm run verify` | 14 tests passed; shared keyboard builds/syncs | Avro, Unicode, crypto, ten encodings, framing, wrong keys, tampering, limits |
| `npm run test:interop` | 54 checks passed | Web Crypto, Java JCA, Apple CryptoKit/CommonCrypto on macOS; generated keys, passphrases, Unicode normalization, tamper rejection |
| `npm run test:e2e` | 17 browser E2E tests passed | Visible draft, one-shot Shift/Caps Lock, emoji, mode chooser, transactional close/cancel flows, selection and held deletion, adjacent/nested frames, batch tamper fail-closed, first-time key prompt, automatic-read opt-out, wrong key, XSS-as-text, Avro/backspace, locking, offline operation, no web storage, accessibility at 320px |
| Android `assembleDebug assembleRelease` | Passed | Installable debug APK and unsigned release APK |
| Android `lintDebug` | Passed, 0 errors / 8 warnings | Remaining warnings concern newer dependency versions, intentional bundled JavaScript, and debug-only untranslated test labels |
| `npm run test:android` | Passed on API 35 emulator | Actual IME/editor connection, settings/mode × navigation and cancellation, key keypad, selected-range and held deletion, Shift/emoji/mode chooser, adjacent native framed inserts, automatic saved-key unlock after Lock, Keystore save/restore/delete, native Unicode passphrase → Web Crypto interoperability, hide-to-lock |
| `scripts/test-release-android.mjs` (signed `2.0.1` APK) | Pending final artifact | Exact signed APK: package/version, non-debuggable state, IME registration/selection, and same-signature reinstall |
| Release manifest inspection | Passed | No INTERNET, no debug host, no debuggable flag; backups disabled and explicit transfer exclusions |
| Swift parser and Xcode project plist checks | Passed | Syntax/project structure only, not iOS compilation |
| Visual review | Desktop and mobile captured | `design/preview-desktop.png`, `design/preview-mobile.png` |

The native Android test uses a debug host app, not Facebook/WhatsApp/Signal. It
does not prove behavior in every third-party app. The browser's clipboard is a
same-origin simulation; the Android test uses the OS clipboard. The Apple
crypto test runs on macOS, not inside an iOS keyboard extension.

## Implementation notes

- The Android SDK was found at `/opt/homebrew/share/android-commandlinetools`,
  enabling native builds despite the earlier baseline's toolchain warning.
- Fixed inherited Gradle CRLF launcher and missing BuildConfig generation.
- Removed unused Keyman runtime/updater and Sentry/Reachability dependencies
  from active native targets; preserved the baseline in Git and legacy assets.
- Aligned transitive Kotlin libraries after removing the old runtime.
- Settings persist locally; secrets persist only with opt-in protected storage.
- There is no network dependency in the encryption path. A generated 256-bit key takes the fast HKDF/AES-GCM path; passphrases deliberately pay the 600,000-iteration PBKDF2 cost on each message. No speed claim is made for every device.
- Async results cannot restore keys or insert a message after session locking.
- A public demo key exists only in the design/test harnesses, not as a native
  keyboard default. Native encryption requires user setup.
- GitHub CI now passes shared tests, Android builds, and Apple interop/iOS
  simulator compilation. Commit `8822ac0` fixed the removed Android SDK tools
  package and the inherited Swift 4.0 language mode.

## Release status

Android packaging uses a persistent release key outside Git, with its password
in macOS Keychain. The release script builds, checks, signs and fingerprints
the APK. A separate emulator test host exercises the signed production variant.
Full Xcode is absent locally; GitHub's macOS runner compiles the iOS simulator
target successfully. No iPhone distribution is configured.

Not approved for production release. Full iOS Xcode/device testing, physical
Android device and real messaging-app testing, independent security review,
and final signing/distribution remain release requirements. No claim of being
unhackable is made. Fixed shared keys do not provide forward secrecy or sender
identity authentication; detailed limits are in SECURITY.md.

## History

- `fca525a`: original Android/iOS Avro baseline on `main`.
- `31f0014`: authenticated message protocol and native crypto.
- `5a2ac3d`: visible private composer and interactive design.
- `9c93985`: native bridge, clipboard, and protected key storage.
- Subsequent commits record dependency cleanup, regression tests, and this
  handoff. Use `git log --oneline --decorate --all` for exact IDs.

Sources are pushed to GitHub. Screenshots are versioned; release APKs and
checksums are distributed as GitHub Release assets, not committed binaries.
See RELEASING.md for signing identity preservation and artifact provenance.
