# Gachlagan private keyboard

An offline Android keyboard and iOS keyboard extension with a **visible private draft**, one-tap encryption, Bangla Avro Phonetic, emoji, and an in-keyboard message reader. There are no accounts, encryption servers, analytics, or online key services.

**Release status:** `0.2.0-rc.1` is a source release candidate, **not a security-certified or production-approved release**. Android debug and unsigned release builds can be produced locally. iOS still needs a full Xcode/device run. Physical-device, real-app, and independent security review remain outstanding; see [verified results](docs/PROGRESS.md) and [security limits](docs/SECURITY.md) before using it for sensitive messages.

![Private composer and reader design](design/preview-desktop.png)

## Try the design

Requirements: Node.js 20+.

```sh
npm ci
npm run preview
```

Open **http://127.0.0.1:4173**. The two-phone preview uses the actual keyboard UI and real local encryption. Click **Set up a demo conversation**, type in the visible draft, encrypt, send, and copy the received message. The recipient’s keyboard shows the plaintext; Private reply completes the return flow.

The demo uses a public test key and a simulated clipboard. It is for review, not real secrets. The localhost HTTP server only serves preview files; installed keyboards bundle these files and need no server.

## Everyday flow

1. Open keyboard settings on both phones. Tap **Generate key** for a fast random 256-bit key, or enter the same long custom passphrase. Exchange it in person or over an independently trusted channel. Save it in protected device storage if desired.
2. Type into the **Private draft**. The words are visible to you and remain inside the keyboard. Tap বাংলা for local Avro phonetic: `ami` → `আমি`, `bangladesh` → `বাংলাদেশ`. Tap Shift once for one capital, twice for Caps Lock, a third time to turn it off. Tap ☺ for emoji, or 123 and #+= for symbol pages.
3. Tap **Encrypt & insert**. Only the framed ciphertext enters the chat. You can type and insert a second message into the same unsent chat draft; each insert gets its own header and tail. Use the chat app’s Send button.
4. Copy a complete received frame or several adjacent frames in one selection. Automatic reading is on by default: while the keyboard is visible and OS clipboard access is allowed, the reader opens and shows all authenticated messages. A saved device key loads automatically; otherwise enter the shared key once. If your OS misses the copy event, tap **Read copied message** in the toolbar. No paste into the chat is needed.
5. Tap **Private reply** to compose again. Lock clears the active key and plaintext. A saved key can unlock automatically on the next copied message; otherwise enter your key again.

The message-mode chooser opens inside the keyboard (tap the mode label or Settings → Message mode). Settings use the full keyboard area until you tap the key field; then the keys appear and the field stays visible. Tap **Done typing** to return to the full settings view.

### Security modes and speed

| Mode | Secret? | What it does |
| --- | --- | --- |
| Private · AES-256-GCM with generated key | Yes | Authenticated encryption; HKDF-SHA256 creates a fresh per-message key. Recommended, fast route. |
| Private · AES-256-GCM with custom passphrase | Yes | Same encryption, but PBKDF2-HMAC-SHA256 performs 600,000 iterations per message to resist guessing. Noticeably slower by design. |
| Binary, octal, decimal, hex, Base32, Base64url, Base64, percent | No | Reversible public encodings of UTF-8 bytes, including Bangla and emoji. |
| ROT13, Morse | No | Public text conversions. ROT13 changes Latin letters only; Morse uppercases English and rejects unsupported Bangla. |

There is **one vetted private cipher suite**; the extra choices are labeled public conversions, not additional encryption algorithms. Hashes are one-way and are not messaging modes. Neither encryption nor decryption calls a server or needs Internet access. A generated random key avoids the expensive passphrase derivation; speed also depends on the device and number of frames.

New inserts look like `[[GK2:<length>]]GK1.…[[/GK2]]`. The wrapper separates messages; GK1 is the authenticated ciphertext inside. Older standalone GK1 messages remain readable. To add another layer, copy a framed message, return to the private composer, tap **Paste**, then **Encrypt & insert**. The reader unwraps up to three layers. Frames do **not** authenticate the order or completeness of a whole chat; someone can remove or reorder valid frames. See [the protocol and threat model](docs/SECURITY.md).

Normal typing sends text directly to the app and is explicitly labeled as unprotected. The private composer is necessary because encrypting plaintext after an app has already seen it cannot undo that exposure. The current Avro composition path is the private composer.

## Build Android

Requirements: Android SDK 36, Build Tools 36, JDK 21. Minimum Android 8 / API 26, with an up-to-date Android System WebView.

```sh
npm run build:secure
cd mobile/android
./gradlew assembleDebug assembleRelease lintDebug
```

Set `ANDROID_HOME` to your SDK or configure `mobile/android/local.properties`. On this development machine the SDK is `/opt/homebrew/share/android-commandlinetools`.

- Debug APK: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Unsigned release APK: `mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk`

Install the debug APK, open Gachlagan Keyboard, enable it, and select it. Debug builds enable WebView inspection and include a test host; **use test messages only**. Release builds disable debugging and exclude that host. The unsigned release APK **cannot** be installed as a trusted public release; sign it with your own private release key before distributing. INTERNET permission is removed from the merged manifest; backups and device transfer of app data are excluded.

## Build iOS

Requirements: full Xcode and an Apple development team. The existing project supports iOS 15.6+; real OS compatibility remains to be verified.

```sh
npm run build:secure
open mobile/ios/KMSample2.xcodeproj
```

The internal project name is inherited from the original starter; the product is Gachlagan Keyboard. Set your team for both targets and adjust bundle IDs/entitlements as necessary. Enable the keyboard in Settings → General → Keyboard → Keyboards. Full Access and paste permission may be required for clipboard reading. Neither permission creates a network dependency.

The active targets no longer link or embed the legacy Keyman engine, Sentry, Reachability, DeviceKit, or ZIPFoundation. Carthage/bootstrap-ios is only for the historical baseline and is not needed for this branch. The extension uses bundled Avro, WebKit, CryptoKit/CommonCrypto, and device-only Keychain storage.

## GitHub release instructions

This repository contains **source and build instructions**, not a signed public binary. Do not attach the debug APK, an unsigned APK, private signing keys, or a test-key-configured build to a GitHub Release.

### Android release

1. Run the [verification commands](#verification) and the remaining [release gates](docs/SECURITY.md#release-gates-still-requiring-real-validation). Increase `versionCode` for every published update and keep `versionName` in sync with the Git tag.
2. In Android Studio, open `mobile/android`, choose **Build → Generate Signed Bundle / APK**, and sign the **release** variant with a private key you control. Choose APK for GitHub sideloading or Android App Bundle for Google Play. Back up the signing key securely; losing it can prevent compatible updates.
3. Install that signed APK on physical Android devices; confirm keyboard setup, ciphertext-only insertion, multi-frame copying, key storage, clipboard behavior, and host-app compatibility. Verify that the final merged manifest has no INTERNET permission and the release app is not debuggable.
4. Compute and publish a SHA-256 checksum alongside the signed APK, release notes, supported Android versions, and the exact source Git tag. Keep signing credentials out of this repository and CI logs. [Android’s signing guide](https://developer.android.com/studio/publish/app-signing) explains the supported signing flows.

### iOS release

1. Use full Xcode on macOS. Run `npm ci && npm run build:secure`, open `mobile/ios/KMSample2.xcodeproj`, select your Apple development team for the containing app and keyboard extension, and set unique bundle identifiers and matching capabilities. This checkout has **not** been fully built or tested with Xcode.
2. Build and test on real iPhones/iPads, including copy/paste permissions and Full Access, app switching, password fields, key recovery, multiline editors, and multiple host apps. Full Access grants the extension additional OS capabilities, but this app makes no network calls; explain that distinction to users.
3. Archive the containing app in Xcode and distribute through TestFlight or the App Store after signing and review. A source checkout on GitHub is buildable by developers with their own signing setup; an unsigned IPA is not a generally installable iPhone release. [Apple’s distribution guide](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases) covers archives and TestFlight/App Store delivery.
4. Link the TestFlight/App Store listing, release notes, supported iOS versions, and exact source Git tag from the GitHub Release. Never publish provisioning profiles, certificates, or private keys.

Do not describe a GitHub tag or successful automated tests as proof that the keyboard is secure in all messaging apps. Publish as a **pre-release** until the device, host-app, and independent review gates are complete.

## Verification

```sh
npm run verify          # Avro + crypto/encoding tests, legacy KMP build, UI sync
npm run test:interop    # Java / Apple CryptoKit / Web Crypto; requires JDK + Swift on macOS
npx playwright install chromium android
npm run test:e2e        # Browser conversation, privacy boundaries, accessibility
npm run test:android    # Running emulator + built debug APK; never runs on a physical phone
npm run capture:design # Preview server must be running
```

Android E2E installs the debug app and temporarily changes the emulator’s keyboard. It restores the previous keyboard afterward. It verifies native editor insertion, actual clipboard delivery, protected storage, deletion, and hide-to-lock. Neither this test host nor the browser preview proves compatibility with every messaging app.

## Source and history

- `secure/`: shared UI, privacy state, encodings, Web Crypto reference implementation.
- `mobile/android/`: Android IME, JCA encryption, Keystore, local WebView bridge.
- `mobile/ios/SWKeyboard/`: iOS extension, CryptoKit/CommonCrypto, Keychain, local WebView bridge.
- `design/`: interactive two-phone review page and screenshots.
- `third_party/jsAvroPhonetic/`: original MPL-1.1 Avro parser.
- `keyboard/`: original Keyman project retained for the baseline; its SDK is not part of the active private keyboard runtime.
- `docs/SECURITY.md`: protocol, threat model, sources, and release gates.
- `docs/PROGRESS.md`: verified results and unfinished work.

`main` preserves the first Avro milestone (`fca525a`). Encryption work is on `feature/offline-encrypted-keyboard`. See `git log --oneline --decorate --all`. Nothing has been pushed, signed for public distribution, or published from this workspace.
