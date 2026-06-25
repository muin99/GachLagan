# Third-party software

This starter intentionally assembles established open-source projects instead
of introducing a new keyboard engine.

- **Keyman Engine 18.0.252** — system keyboard runtime and UI for Android and
  iOS. Copyright SIL Global, licensed under the MIT License. Source:
  <https://github.com/keymanapp/keyman>
- **Keyman US Basic touch layout** — the QWERTY touch-layout foundation.
  Copyright 2008–2020 SIL International, licensed under the MIT License. Its
  license is copied to `keyboard/KEYMAN_LAYOUT_LICENSE.md`.
- **jsAvroPhonetic 1.1.4** — Avro Phonetic transliteration rules. Copyright
  OmicronLab and Rifat Nabi, licensed under MPL-1.1. The unmodified upstream
  source and license are in `third_party/jsAvroPhonetic/`.

The small adapter appended to `keyboard/source/avro-engine.js` is kept in that
MPL-covered file so the original file-level license remains straightforward.
