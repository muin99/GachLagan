# Work log

Branch: `feature/offline-encrypted-keyboard`. Baseline: `fca525a` on `main`.

## Implemented in this branch

- Shared private composer with visible plaintext draft; ciphertext only enters the host app after Encrypt & insert.
- Local message reader, settings, Avro typing, and unkeyed encoding modes.
- Versioned authenticated encryption using platform AES-256-GCM. Generated 256-bit shared keys are the recommended mode; custom passphrases are supported with PBKDF2-HMAC-SHA256 (600,000 iterations).
- Native crypto implementations for Android and iOS plus a browser implementation for interop and interface tests.

## In progress

- Native keyboard bridge, protected key storage, clipboard and lifecycle handling.
- Interactive design preview and end-to-end tests.

## Release status

Not approved for production release. Native device testing, independent security review, and final signing/distribution remain release requirements. No claim of being unhackable is made.

See `git log --oneline --decorate --all` for the actual commit history. Results will be recorded here after testing; planned tests are not passes.
