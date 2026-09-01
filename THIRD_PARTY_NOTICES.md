# Third-party software

The project began from established open-source keyboard projects. The private
keyboard bundles the original Avro parser and uses platform cryptography.

- **Keyman Engine 18.0.252** — original baseline runtime, retained in the
  repository but excluded from the active private-keyboard build. Copyright SIL Global, licensed under the MIT License. Source:
  <https://github.com/keymanapp/keyman>
- **Keyman US Basic touch layout** — the QWERTY touch-layout foundation.
  Copyright 2008–2020 SIL International, licensed under the MIT License. Its
  license is copied to `keyboard/KEYMAN_LAYOUT_LICENSE.md`.
- **jsAvroPhonetic 1.1.4** — Avro Phonetic transliteration rules. Copyright
  OmicronLab and Rifat Nabi, licensed under MPL-1.1. The unmodified upstream
  source and license are in `third_party/jsAvroPhonetic/`.

The small adapter appended to `keyboard/source/avro-engine.js` is kept in that
MPL-covered file so the original file-level license remains straightforward.

The private UI copies `third_party/jsAvroPhonetic/avro-lib.js` unmodified to each
bundle as `avro.js`, including its original MPL header. Changes to the Avro
parser must retain its file-level license and source availability.

Android UI dependencies are AndroidX AppCompat, ConstraintLayout, and WebKit
(Apache-2.0), with Kotlin standard-library dependencies (Apache-2.0). The iOS
runtime uses Apple system frameworks. Web Crypto, JCA, CryptoKit, and
CommonCrypto implement the cryptographic primitives; no external crypto
service is called. Development tools (Keyman compiler, esbuild, Playwright,
axe-core) are pinned in package-lock.json and are not shipped as runtime tools.
