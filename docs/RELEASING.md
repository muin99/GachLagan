# Android release maintenance

The public APK is the **release** build, signed with a persistent RSA-3072 identity. The debug test app and WebView inspection are excluded. Release assets contain the APK, SHA256SUMS, the **public** signing certificate, and release.json linking the APK to its exact source commit.

## Preserve the signing identity

On the release Mac, the encrypted private keystore is at:

`~/Library/Application Support/GachLagan/release-signing/android-release.p12`

Its random password is stored in login Keychain as service `com.gachlagan.android.release-signing`, account `android-release`. Use Keychain Access to recover the password when migrating. Keep an encrypted backup of the keystore and a securely stored recovery copy of its password. Both are required on a replacement Mac. Neither belongs in GitHub, release assets, screenshots, or chat. The public certificate can be shared.

The first identity was established with `npm run release:android -- --init-key`. Running it again preserves the existing identity. Never generate a replacement identity for an existing app: compatible Android updates require the original key (unless a supported signing-key rotation is deliberately arranged).

## Build and verify

1. Increment Android `versionCode` for every update. Match `versionName`, package.json, and the root entries of package-lock.json. Set the release tag and direct APK link accordingly.
2. Run unit/browser/native interoperability checks and Android emulator tests. Commit all source and documentation changes on a release branch.
3. Set `ANDROID_HOME` to the SDK root, then run `npm run release:android`. This rebuilds the bundled UI and release APK, runs release lint, checks the package/version, rejects INTERNET permission, debug capabilities and enabled backups, verifies alignment, signs, and verifies the signature. It refuses dirty worktrees and existing output APKs.
4. Artifacts are written under `artifacts/releases/v<VERSION>/`, which Git ignores. `release.json` records the source commit and signing-certificate fingerprint; SHA256SUMS covers the APK and metadata.
5. Set `ANDROID_SERIAL=emulator-...` and run `node scripts/test-release-android.mjs artifacts/releases/v<VERSION>/GachLagan-v<VERSION>-android.apk`. This installs the exact signed APK and checks its package/version, non-debuggable state, IME registration/selection, and same-signature update path. Production `FLAG_SECURE` and disabled WebView inspection intentionally prevent UI inspection of the public build. Full UI, clipboard, protected-storage, and decryption behavior is covered by the debug native and browser E2E suites built from the same source and bundled assets.
6. Push the release branch and wait for CI. Tag the exact `sourceCommit`, attach only the four public artifacts to a draft GitHub Release, and publish it as a **pre-release** while device coverage and independent review remain incomplete. Verify the anonymous download works and its checksum matches the local artifact. Merge the verified release commit into `main`.

Do not replace an already published APK with rebuilt bytes. Publish a new version instead. Users must retain their shared encryption keys when uninstalling a debug build before installing the first official release; the app has no server backup.

## iPhone distribution

The iOS simulator build passes CI. A regular-user download additionally requires Apple Developer Program membership, signing/provisioning, an App Store Connect app record, device testing, and Apple's TestFlight/App Store distribution process. A simulator build or unsigned IPA cannot substitute for that process. Android distribution can proceed independently.
