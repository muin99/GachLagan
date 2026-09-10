# Work log

Branch: `feature/offline-encrypted-keyboard`. Baseline: `fca525a` on `main`.

## Implemented in this branch

- Shared private composer with visible plaintext draft; ciphertext only enters the host app after Encrypt & insert.
- Local message reader, settings, Avro typing, and unkeyed encoding modes.
- Versioned authenticated encryption using platform AES-256-GCM. Generated 256-bit shared keys are the recommended mode; custom passphrases are supported with PBKDF2-HMAC-SHA256 (600,000 iterations).
- Native crypto implementations for Android and iOS plus a browser implementation for interop and interface tests.

## Verified on 2026-09-25

| Check | Result | Scope |
| --- | --- | --- |
| `npm run verify` | 12 tests passed; shared keyboard builds/syncs | Avro, Unicode, crypto, encodings, wrong keys, tampering, limits |
| `npm run test:interop` | 54 checks passed | Web Crypto, Java JCA, Apple CryptoKit/CommonCrypto on macOS; generated keys, passphrases, Unicode normalization, tamper rejection |
| `npm run test:e2e` | 7 browser E2E tests passed | Visible draft, ciphertext-only host, copy/decrypt/reply, wrong key, XSS-as-text, Avro/backspace, locking, in-flight cancellation, offline operation, no web storage, accessibility at 320px |
| Android `assembleDebug assembleRelease` | Passed | Installable debug APK and unsigned release APK |
| Android `lintDebug` | Passed, 0 errors / 8 warnings | Remaining warnings concern newer dependency versions, intentional bundled JavaScript, and debug-only untranslated test labels |
| `npm run test:android` | Passed on API 35 emulator | Actual IME/editor connection, visible plaintext in keyboard only, native encryption/insertion, actual clipboard auto-decryption, full reader, Keystore save/restore/delete, native Unicode passphrase → Web Crypto interoperability, hide-to-lock |
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
- Async results cannot restore keys or insert a message after session locking.
- A public demo key exists only in the design/test harnesses, not as a native
  keyboard default. Native encryption requires user setup.
- CI definitions for shared tests, Android builds, and Apple interop/iOS
  compilation are checked in. They have **not** run on a remote CI service;
  adding a workflow is not evidence that its iOS build passes.

## Release status

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

No remote has been configured and nothing has been pushed, signed for public
distribution, or published. Screenshots are versioned; APK build artifacts are
ignored by Git and reproducible from the checked-in source.
