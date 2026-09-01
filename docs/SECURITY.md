# Security design and release limits

This is an implemented security feature under test, not a certification or a promise that it cannot be hacked. No server is needed to generate keys, encrypt, encode, or decrypt. Build tools download dependencies; the installed keyboard uses bundled assets and platform cryptography only.

## Protected workflow

1. Both people manually enter the same shared secret. Prefer a generated, random 256-bit key; exchange it in person or through an independently trusted channel.
2. Compose in the keyboard’s visible **Private draft**. Plaintext is never inserted into the messaging app during private composition. Avro is processed locally.
3. **Encrypt & insert** places only a GK1 ciphertext envelope into the current editor. The messaging app sends it using its normal Send button.
4. Copy a received GK1 message. While the keyboard is visible and automatic reading is enabled, the supported native clipboard event opens it in the full keyboard reader. A manual **Read copied message** button is available when OS restrictions prevent this.
5. **Private reply** clears the reader and opens the composer. There is intentionally no action that copies decrypted plaintext into the clipboard or chat.

Typing plaintext into an app first and encrypting it afterward cannot stop that app from having observed the original text. Normal typing is explicitly marked as visible to the app. This build does not crawl or replace an arbitrary app’s entire draft: iOS provides limited text context, and destructive replacement can lose user text.

## Cryptographic protocol: GK1

`GK1.K.<salt>.<nonce>.<ciphertext-and-tag>` or `GK1.P.<salt>.<nonce>.<ciphertext-and-tag>`

- Cipher: AES-256-GCM; 128-bit authentication tag; no CBC, ECB, or unauthenticated encryption.
- Fresh 16-byte salt and 12-byte nonce for every message, from the platform cryptographic RNG.
- `K`: a manually shared random 32-byte key, displayed as `GKKEY1.<base64url>`. Derive a **new message key** with RFC 5869 HKDF-SHA256, salt from the envelope, and info `Gachlagan/GK1/A256GCM`. The randomized per-message key also avoids relying solely on random 96-bit GCM nonces under one long-lived AES key.
- `P`: NFC-normalized UTF-8 passphrase, PBKDF2-HMAC-SHA256, fixed 600,000 iterations, 32-byte derived key, envelope salt. Minimum 16 Unicode scalars; maximum 256 UTF-8 bytes. Length is not an entropy guarantee. Recommend 5–6 randomly selected words; repeated or predictable text remains weak.
- Associated authenticated data: exact UTF-8 bytes of the first four fields, including dots. Version, key type, salt, and nonce are authenticated. The key is never included.
- Base64url is unpadded and must be canonical. Unknown versions, malformed lengths, extra fields, invalid UTF-8, and altered messages fail closed. A wrong key and tampering yield no decrypted text.
- Maximum plaintext: 4,096 UTF-8 bytes. Maximum envelope accepted before parsing: 40,000 characters. KDF work factors are fixed by the version and never controlled by untrusted input. Native crypto queues are bounded.

Implementations: Web Crypto (preview), Android JCA (`Cipher`, `SecretKeyFactory`, `Mac`), Apple CryptoKit and CommonCrypto. No cipher implementation is handwritten. The small Android HKDF composition uses standard HMAC calls for RFC 5869’s extract/expand steps. Native cross-implementation fixtures verify Unicode normalization and interoperability.

AES-GCM is a standard authenticated-encryption choice. Argon2id is usually preferable for human passwords when suitable memory is available; it is not silently substituted here. PBKDF2 is used for portable platform-native execution in constrained keyboard extensions, at the OWASP-listed SHA256 work factor. Random shared keys are the recommended security path and do not depend on human-password strength. This is a deliberate portability tradeoff, not a claim that one algorithm is universally “best.”

## Public encodings: GE1

`GE1.<binary|octal|hex|base64|morse>.<encoded-text>`

These provide **no secrecy or authentication** and require no key. UTF-8 byte encodings round-trip Bangla and emoji. Morse supports its documented English alphabet and common punctuation, converts letters to uppercase, and rejects unsupported characters rather than silently losing Bangla. Hashes are not offered as reversible message modes. A “custom key” changes the shared secret, not the cryptographic algorithm; arbitrary executable encryption code is not accepted.

The version markers allow automatic recognition. Arbitrary unmarked binary from another converter is not automatically interpreted as a secret message; this avoids reading unrelated clipboard content as messages.

## Local storage and lifecycle

- No messages or drafts are persisted. The browser preview holds secrets in session memory only; no localStorage, sessionStorage, cookies, service worker, analytics, remote fonts, or server API.
- Native key persistence is opt-in. Android encrypts the secret using an AES-GCM wrapping key in AndroidKeyStore and stores only the encrypted blob in private preferences. App backups are disabled. Hardware backing depends on device capabilities; it is not guaranteed.
- iOS uses a non-synchronizing Keychain item with `WhenUnlockedThisDeviceOnly`. It is private to the extension and excluded from migration to another device. Device-unlocked access is not biometric authentication for every use. Keychain items may survive uninstall; use Forget saved key to delete them.
- Lock, hiding the keyboard, and 60 seconds of inactivity clear the active key, draft, and reader. A saved key remains encrypted until explicitly loaded or forgotten. Asynchronous crypto results from an earlier session are ignored.
- Mutable buffers are cleared where practical. JavaScript/Java/Swift strings and platform crypto internals can have copies managed by runtimes; guaranteed memory zeroization is not claimed.
- Android requests `FLAG_SECURE` for its keyboard window. Release WebViews disable debugging. The debug APK intentionally enables local WebView inspection for tests and must not be used for real secrets.
- iOS hides/clears the keyboard on disappearance and detected screen capture. iOS cannot guarantee prevention of screenshots. Screenshots, cameras, accessibility services, malicious keyboards, a rooted/jailbroken OS, or a compromised keyboard binary remain endpoint risks.

## Clipboard and network boundaries

Android’s default IME can access the clipboard subject to OS behavior. Automatic reads are optional and limited to the visible keyboard, recognized GK1/GE1 text, and bounded sizes. Clipboard history is not retained. URI clipboard data is not opened. Keys are read only through an explicit Paste key action.

iOS clipboard access may require Full Access and system paste approval. Extensions cannot execute continuously in the background; copying while the extension is absent cannot immediately display a reader. Opening the keyboard allows the next attempt. The OS may still require tapping Read copied message. No permission bypass is attempted.

Android removes INTERNET permission, blocks WebView network loads, and serves assets through AndroidX’s local asset loader. iOS loads only a bundled file directory into a nonpersistent WKWebView, rejects navigation elsewhere, and the bundled UI has a restrictive CSP with `connect-src 'none'`. No arbitrary HTML is inserted: messages use textContent. Unused Keyman runtime/updater and Sentry/Reachability dependencies have been removed from the active build targets; the original starter remains in Git and legacy source/assets remain for reference. Avro is still bundled. A dependency audit remains part of release review.

## What this does and does not protect

If the transport service or its stored message database is compromised, properly encrypted messages remain ciphertext, assuming the endpoint devices, keyboard software, keys, and cryptographic implementations remain secure. Sender/recipient identities, timing, approximate length, and traffic patterns are not hidden.

This is shared-key message encryption, **not a Signal-style ratcheting protocol**. It has no forward secrecy, post-compromise security, sender-specific signatures, or persistent replay prevention. Anyone with the shared key can forge a message; decryption does not prove which person sent it. If the key is later stolen, old captured messages using it can be decrypted. Rotate keys manually and retain old keys securely if old history must remain readable. There is no account recovery, server reset, or way to decrypt without the secret.

## Sources

- [OWASP cryptographic storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP password storage and PBKDF2 work factors](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [RFC 5869 HKDF](https://www.rfc-editor.org/rfc/rfc5869)
- [Android clipboard privacy](https://developer.android.com/about/versions/10/privacy/changes)
- [Apple custom keyboard capabilities and restrictions](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/CustomKeyboard.html)
- [Apple Keychain device-only accessibility](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly)

## Release gates still requiring real validation

- Full iOS Xcode build, signing, and tests on real iPhones/iPads; extension memory pressure, clipboard prompts, lock/unlock, editor changes, and interruption behavior.
- Android physical devices, current/older WebView versions, OEM clipboard behavior, password fields, rotation, accessibility, multiline editors, emoji deletion, and large font scaling.
- Cross-app validation in actual messaging apps. The preview and debug test host cannot establish behavior for every host editor; iOS insertion has no reliable success acknowledgement and transport apps can reject/truncate ciphertext.
- Independent review of the wire protocol, bridge, lifecycle, endpoint threat model, dependency supply chain, and release artifacts. Algorithm correctness tests do not prove application security.
- Release signing, store metadata/privacy declarations, dependency locking/SBOM, signed update distribution, and a vulnerability-reporting process.

Do not label the software production-ready until these gates have evidence. See PROGRESS.md for completed checks and remaining work.
