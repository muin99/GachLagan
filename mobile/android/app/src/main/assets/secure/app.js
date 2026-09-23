(() => {
  // secure/core.mjs
  var MAX_BYTES = 4096;
  var MAX_WIRE = 4e4;
  var ITERATIONS = 6e5;
  var utf8 = new TextEncoder();
  var decoder = new TextDecoder("utf-8", { fatal: true });
  function b64(bytes) {
    return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }
  function unb64(text) {
    if (typeof text !== "string" || !/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) throw new Error("Invalid message format.");
    const bytes = Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
    if (b64(bytes) !== text) throw new Error("Invalid message format.");
    return bytes;
  }
  function checkText(text) {
    if (typeof text !== "string" || !text.length || utf8.encode(text).length > MAX_BYTES || decoder.decode(utf8.encode(text)) !== text) throw new Error("Write a message of 1\u20134,096 UTF-8 bytes.");
  }
  function checkSecret(secret2) {
    if (typeof secret2 !== "string") throw new Error("Set a shared key first.");
    if (secret2.startsWith("GKKEY1.")) {
      if (secret2.length !== 50 || unb64(secret2.slice(7)).length !== 32) throw new Error("That shared key is incomplete.");
      return "K";
    }
    if (decoder.decode(utf8.encode(secret2)) !== secret2 || [...secret2.normalize("NFC")].length < 16 || utf8.encode(secret2.normalize("NFC")).length > 256) {
      throw new Error("Use a long shared passphrase: 16+ characters, at most 256 UTF-8 bytes.");
    }
    return "P";
  }
  function generateKey() {
    return "GKKEY1." + b64(crypto.getRandomValues(new Uint8Array(32)));
  }
  function parseEnvelope(wire) {
    if (typeof wire !== "string" || wire.length > MAX_WIRE) throw new Error("Message is too large.");
    const parts = wire.trim().split(".");
    if (parts.length !== 5 || parts[0] !== "GK1" || !["K", "P"].includes(parts[1])) throw new Error("Not a supported encrypted message. Copy the entire GK1 message.");
    const salt = unb64(parts[2]), nonce = unb64(parts[3]), ciphertext = unb64(parts[4]);
    if (salt.length !== 16 || nonce.length !== 12 || ciphertext.length < 17 || ciphertext.length > MAX_BYTES + 16) throw new Error("The encrypted message is incomplete or too large.");
    return { kind: parts[1], salt, nonce, ciphertext, aad: utf8.encode(parts.slice(0, 4).join(".")) };
  }
  async function derive(secret2, salt, kind) {
    if (checkSecret(secret2) !== kind) throw new Error("This message needs a different type of shared key.");
    const raw = kind === "K" ? unb64(secret2.slice(7)) : utf8.encode(secret2.normalize("NFC"));
    try {
      const material = await crypto.subtle.importKey("raw", raw, kind === "K" ? "HKDF" : "PBKDF2", false, ["deriveKey"]);
      const parameters = kind === "K" ? { name: "HKDF", hash: "SHA-256", salt, info: utf8.encode("Gachlagan/GK1/A256GCM") } : { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS };
      return await crypto.subtle.deriveKey(parameters, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    } finally {
      raw.fill(0);
    }
  }
  async function seal(text, secret2) {
    checkText(text);
    const kind = checkSecret(secret2), salt = crypto.getRandomValues(new Uint8Array(16)), nonce = crypto.getRandomValues(new Uint8Array(12));
    const header = ["GK1", kind, b64(salt), b64(nonce)].join(".");
    const key2 = await derive(secret2, salt, kind), plain = utf8.encode(text);
    try {
      const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: utf8.encode(header), tagLength: 128 }, key2, plain);
      return header + "." + b64(new Uint8Array(cipher));
    } finally {
      plain.fill(0);
    }
  }
  async function open(wire, secret2) {
    const { kind, salt, nonce, ciphertext, aad } = parseEnvelope(wire);
    const key2 = await derive(secret2, salt, kind);
    let plain;
    try {
      plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 }, key2, ciphertext));
      return decoder.decode(plain);
    } catch {
      throw new Error("Cannot unlock: the key is different or this message was changed.");
    } finally {
      plain?.fill(0);
    }
  }
  var MORSE = Object.fromEntries("A .-|B -...|C -.-.|D -..|E .|F ..-.|G --.|H ....|I ..|J .---|K -.-|L .-..|M --|N -.|O ---|P .--.|Q --.-|R .-.|S ...|T -|U ..-|V ...-|W .--|X -..-|Y -.--|Z --..|0 -----|1 .----|2 ..---|3 ...--|4 ....-|5 .....|6 -....|7 --...|8 ---..|9 ----.|. .-.-.-|, --..--|? ..--..|! -.-.--|: ---...|; -.-.-.|- -....-|/ -..-.|@ .--.-.|= -...-|+ .-.-.|( -.--.|) -.--.-".split("|").map((s) => s.split(" ")));
  var INVERSE_MORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
  var bases = { binary: [2, 8], octal: [8, 3], decimal: [10, 3], hex: [16, 2] };
  var BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  function base32(bytes) {
    let bits = 0, value = 0, result = "";
    for (const byte of bytes) {
      value = value << 8 | byte;
      bits += 8;
      while (bits >= 5) {
        result += BASE32[value >>> (bits -= 5) & 31];
      }
      value &= (1 << bits) - 1;
    }
    if (bits) result += BASE32[value << 5 - bits & 31];
    return result;
  }
  function unbase32(body) {
    if (!/^[A-Z2-7]+$/.test(body) || body.length > Math.ceil(MAX_BYTES * 8 / 5)) throw new Error("Invalid Base32 text.");
    const bytes = [];
    let bits = 0, value = 0;
    for (const char of body) {
      value = value << 5 | BASE32.indexOf(char);
      bits += 5;
      if (bits >= 8) {
        bytes.push(value >>> (bits -= 8) & 255);
        value &= (1 << bits) - 1;
      }
    }
    const result = Uint8Array.from(bytes);
    if (base32(result) !== body) throw new Error("Invalid Base32 text.");
    return result;
  }
  function rot13(text) {
    return text.replace(/[A-Za-z]/g, (char) => String.fromCharCode(char.charCodeAt(0) + (char.toLowerCase() <= "m" ? 13 : -13)));
  }
  var ENCODING_MODES = ["binary", "octal", "decimal", "hex", "base32", "base64", "base64classic", "percent", "rot13", "morse"];
  function encode(text, mode) {
    checkText(text);
    let body;
    if (mode === "morse") {
      if ([...text.toUpperCase()].some((c) => c !== " " && !MORSE[c])) throw new Error("Morse supports English letters, numbers, spaces, and common punctuation. Use binary or hex for Bangla.");
      body = [...text.toUpperCase()].map((c) => c === " " ? "/" : MORSE[c]).join(" ");
    } else if (bases[mode]) {
      const [base, width] = bases[mode];
      body = [...utf8.encode(text)].map((b) => b.toString(base).padStart(width, "0")).join(" ");
    } else if (mode === "base32") body = base32(utf8.encode(text));
    else if (mode === "base64") body = b64(utf8.encode(text));
    else if (mode === "base64classic") body = btoa(String.fromCharCode(...utf8.encode(text)));
    else if (mode === "percent") body = [...utf8.encode(text)].map((byte) => "%" + byte.toString(16).toUpperCase().padStart(2, "0")).join("");
    else if (mode === "rot13") body = rot13(text);
    else throw new Error("Unknown encoding.");
    return `GE1.${mode}.${body}`;
  }
  function decode(wire) {
    if (typeof wire !== "string" || wire.length > MAX_WIRE) throw new Error("Message is too large.");
    const match = /^GE1\.(binary|octal|decimal|hex|base32|base64|base64classic|percent|rot13|morse)\.([\s\S]+)$/.exec(wire.trim());
    if (!match) throw new Error("Copy the complete GE1 encoded message.");
    const [, mode, body] = match;
    let text;
    if (mode === "rot13") text = rot13(body);
    else if (mode === "morse") {
      text = body.split(" ").map((code) => {
        if (code === "/") return " ";
        if (!INVERSE_MORSE[code]) throw new Error("Invalid Morse code.");
        return INVERSE_MORSE[code];
      }).join("");
    } else {
      let bytes;
      if (mode === "base64") bytes = unb64(body);
      else if (mode === "base64classic") {
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body)) throw new Error("Invalid Base64 text.");
        bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
        if (btoa(String.fromCharCode(...bytes)) !== body) throw new Error("Invalid Base64 text.");
      } else if (mode === "base32") bytes = unbase32(body);
      else if (mode === "percent") {
        if (!/^(?:%[0-9A-F]{2})+$/.test(body) || body.length > MAX_BYTES * 3) throw new Error("Invalid percent-encoded text.");
        bytes = Uint8Array.from(body.match(/%[0-9A-F]{2}/g), (token) => parseInt(token.slice(1), 16));
      } else {
        const [base, width] = bases[mode], valid = { binary: /^[01]+$/, octal: /^[0-7]+$/, decimal: /^[0-9]+$/, hex: /^[0-9a-f]+$/ }[mode];
        const tokens = body.split(" ");
        if (tokens.length > MAX_BYTES || tokens.some((t) => t.length !== width || !valid.test(t) || parseInt(t, base) > 255)) throw new Error("Invalid encoded bytes.");
        bytes = Uint8Array.from(tokens, (t) => parseInt(t, base));
      }
      text = decoder.decode(bytes);
    }
    checkText(text);
    return { text, mode };
  }

  // secure/framing.mjs
  var MAX_FRAMES = 16;
  var HEADER = /^\[\[(GK2|GE2):([1-9][0-9]{0,4})\]\]/;
  function frameMessage(wire) {
    if (typeof wire !== "string" || !/^(GK1|GE1)\./.test(wire) || wire.length > MAX_WIRE) throw new Error("Invalid message to insert.");
    const kind = wire.startsWith("GK1.") ? "GK2" : "GE2";
    const framed = `[[${kind}:${wire.length}]]${wire}[[/${kind}]]`;
    if (framed.length > MAX_WIRE) throw new Error("Encoded message is too large to insert.");
    return framed;
  }
  function parseMessages(text) {
    if (typeof text !== "string" || text.length > MAX_WIRE) throw new Error("Copied message is too large.");
    const input = text.trim();
    if (/^(GK1|GE1)\./.test(input)) return [input];
    const messages = [];
    let offset = 0;
    while (offset < input.length) {
      while (/\s/.test(input[offset] ?? "")) offset++;
      if (offset === input.length) break;
      const match = HEADER.exec(input.slice(offset));
      if (!match) throw new Error("Copy complete Gachlagan messages, including their headers and tails.");
      const [header, kind, count] = match, length = Number(count);
      if (length > MAX_WIRE || messages.length >= MAX_FRAMES) throw new Error("Too many or oversized messages in this copy.");
      const start = offset + header.length, end = start + length, tail = `[[/${kind}]]`;
      const wire = input.slice(start, end);
      if (input.slice(end, end + tail.length) !== tail || !wire.startsWith(kind === "GK2" ? "GK1." : "GE1.")) {
        throw new Error("A copied message is incomplete or has a damaged tail.");
      }
      messages.push(wire);
      offset = end + tail.length;
    }
    if (!messages.length) throw new Error("Copy a complete Gachlagan message first.");
    return messages;
  }
  function isRecognized(text) {
    return typeof text === "string" && /^(?:GK1\.|GE1\.|\[\[(?:GK2|GE2):)/.test(text.trim());
  }

  // secure/bridge.mjs
  var pending = /* @__PURE__ */ new Map();
  var next = 0;
  var native = Boolean(window.GachlaganNative || window.webkit?.messageHandlers?.gachlagan);
  window.gachlaganResolve = ({ id, result, error }) => {
    const task = pending.get(id);
    if (!task) return;
    clearTimeout(task.timeout);
    pending.delete(id);
    error ? task.reject(new Error(error)) : task.resolve(result);
  };
  async function request(op, args = {}) {
    if (!native) {
      if (op === "seal") return seal(args.text, args.secret);
      if (op === "open") return open(args.wire, args.secret);
      if (op === "generate") return generateKey();
      if (op === "insert" || op === "plain" || op === "backspace" || op === "next") {
        window.parent.postMessage({ source: "gachlagan", op, ...args }, window.location.origin);
        return true;
      }
      if (op === "clipboard") return window.gachlaganPreviewClipboard ?? navigator.clipboard.readText();
      if (op === "saveKey") throw new Error("The browser preview keeps keys in memory only.");
      if (op === "loadKey") return "";
      return true;
    }
    return new Promise((resolve, reject) => {
      const id = ++next;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error("The keyboard did not respond. Try again."));
      }, 2e4);
      pending.set(id, { resolve, reject, timeout });
      const message = { id, op, ...args };
      if (window.GachlaganNative) window.GachlaganNative.postMessage(JSON.stringify(message));
      else window.webkit.messageHandlers.gachlagan.postMessage(message);
    });
  }

  // secure/app.mjs
  var $ = (id) => document.getElementById(id);
  var secret = "";
  var method = "secure";
  var panel = "compose";
  var language = "en";
  var shift = 0;
  var symbols = false;
  var symbolAlt = false;
  var emojiOpen = false;
  var plainMode = false;
  var busy = false;
  var epoch = 0;
  var rawDraft = "";
  var pendingWire = "";
  var lastWire = "";
  var autoRead = true;
  var settingsKeypad = false;
  var modeReturn = "compose";
  var expiry;
  var utf82 = new TextEncoder();
  var MODES = [
    ["secure", "Private \xB7 AES-256-GCM", "Authenticated encryption \xB7 shared key"],
    ["binary", "Binary", "UTF-8 bytes \xB7 0 and 1"],
    ["octal", "Octal", "UTF-8 bytes \xB7 base 8"],
    ["decimal", "Decimal", "UTF-8 bytes \xB7 base 10"],
    ["hex", "Hexadecimal", "UTF-8 bytes \xB7 base 16"],
    ["base32", "Base32", "RFC 4648 alphabet"],
    ["base64", "Base64url", "URL-safe alphabet"],
    ["base64classic", "Base64", "Standard padded alphabet"],
    ["percent", "Percent", "URL-style byte escapes"],
    ["rot13", "ROT13", "Latin letters only; other text unchanged"],
    ["morse", "Morse", "English letters and punctuation"]
  ];
  function status(text, error = false) {
    $("status").textContent = text;
    $("status").classList.toggle("error", error);
  }
  function touch() {
    clearTimeout(expiry);
    expiry = setTimeout(() => lock("Locked after 60 seconds without activity."), 6e4);
  }
  function show(which) {
    if (which !== "settings") settingsKeypad = false;
    panel = which;
    for (const name of ["compose", "read", "settings", "modes"]) $(name + "-panel").hidden = name !== which;
    $("key-area").hidden = which === "read" || which === "modes" || which === "settings" && !settingsKeypad;
    $("keypad-done").hidden = !settingsKeypad;
    document.body.classList.toggle("settings-keypad", which === "settings" && settingsKeypad);
  }
  function openSettings() {
    settingsKeypad = false;
    $("shared-key").value = secret;
    show("settings");
  }
  function methodChanged() {
    const selected = $("method").value, secure = selected === "secure";
    $("method-choice").textContent = MODES.find(([value]) => value === selected)?.[1] ?? MODES[0][1];
    for (const option of $("mode-options").children) option.setAttribute("aria-pressed", String(option.dataset.mode === selected));
    $("key-settings").hidden = !secure;
    $("method-help").textContent = secure ? "Generated 256-bit keys are fast. Passphrases take longer to resist guessing." : selected === "morse" ? "Public. Morse uppercases English and does not support Bangla." : "Public conversion. Anyone can decode it without a key.";
  }
  function openModes(from) {
    modeReturn = from;
    show("modes");
  }
  function updateMode() {
    document.body.classList.toggle("encoding", method !== "secure");
    $("mode-label").textContent = method === "secure" ? "AES-256-GCM" : `${method.toUpperCase()} \xB7 NOT PRIVATE`;
    $("encrypt-label").textContent = method === "secure" ? "Encrypt & insert" : "Encode & insert";
    $("draft-label").textContent = plainMode ? "NORMAL TYPING \xB7 VISIBLE TO APP" : "PRIVATE DRAFT";
    $("plain-mode").textContent = plainMode ? "Back to private \u2197" : "Normal typing \u2197";
    $("draft").disabled = plainMode;
    $("encrypt").hidden = plainMode;
    $("paste-draft").hidden = plainMode;
    $("draft").placeholder = plainMode ? "Keys now type directly into your app." : "Say it only to them\u2026";
  }
  function renderDraft() {
    $("draft").value = language === "bn" ? window.OmicronLab.Avro.Phonetic.parse(rawDraft) : rawDraft;
    $("draft").scrollTop = $("draft").scrollHeight;
  }
  function setBusy(value) {
    busy = value;
    $("encrypt").disabled = value;
    $("read-clipboard").disabled = value;
    $("read-copied").disabled = value;
    $("draft").readOnly = value;
  }
  async function insert() {
    if (busy || plainMode) return;
    if (method === "secure" && !secret) {
      show("settings");
      status("Add the same shared key on both phones first.");
      return;
    }
    const text = $("draft").value, current = epoch;
    try {
      checkText(text);
      setBusy(true);
      status(method === "secure" ? "Encrypting on this device\u2026" : "Encoding on this device\u2026");
      const wire = method === "secure" ? await request("seal", { text, secret }) : encode(text, method);
      if (current !== epoch) return;
      await request("insert", { text: frameMessage(wire) });
      if (current !== epoch) return;
      rawDraft = "";
      renderDraft();
      status(method === "secure" ? "Ciphertext inserted. Send it with your chat app." : "Encoded text inserted. Anyone can decode this.");
    } catch (error) {
      if (current === epoch) status(error.message, true);
    } finally {
      if (current === epoch) setBusy(false);
    }
  }
  async function read(wire, automatic = false) {
    if (busy || automatic && !autoRead) return;
    if (typeof wire !== "string" || wire.length > MAX_WIRE) {
      if (!automatic) status("Clipboard message is too large.", true);
      return;
    }
    wire = wire.trim();
    if (!isRecognized(wire)) {
      if (!automatic) {
        show("read");
        $("read-error").textContent = "Copy a complete Gachlagan message first.";
      }
      return;
    }
    if (automatic && wire === lastWire && panel === "read") return;
    let messages;
    try {
      messages = parseMessages(wire);
    } catch (error) {
      show("read");
      clearReader();
      $("read-error").textContent = error.message;
      return;
    }
    const current = epoch;
    if (messages.some((message) => message.startsWith("GK1.")) && !secret) {
      try {
        setBusy(true);
        const saved = await request("loadKey");
        if (current !== epoch) return;
        if (saved) {
          checkSecret(saved);
          secret = saved;
        } else {
          pendingWire = wire;
          openSettings();
          status("Copied message found. Enter your shared key to read it.");
          return;
        }
      } catch (error) {
        if (current === epoch) {
          pendingWire = wire;
          openSettings();
          status("Saved key unavailable. Enter your shared key to read it.", true);
        }
        return;
      } finally {
        if (current === epoch) setBusy(false);
      }
    }
    show("read");
    $("read-text").textContent = "";
    $("read-error").textContent = "";
    $("reply").hidden = true;
    $("reader-title").textContent = "Opening your message\u2026";
    try {
      setBusy(true);
      let encrypted = false, openedCount = 0;
      async function openGroup(group, depth = 0) {
        if (depth >= 3) throw new Error("This message has too many encryption layers.");
        const result = [];
        for (const item of group) {
          if (++openedCount > 16) throw new Error("Too many messages in this copy.");
          const secured = item.startsWith("GK1.");
          encrypted ||= secured;
          if (secured) parseEnvelope(item);
          const text = secured ? await request("open", { wire: item, secret }) : decode(item).text;
          if (current !== epoch) return [];
          if (/^\[\[(GK2|GE2):/.test(text)) result.push(...await openGroup(parseMessages(text), depth + 1));
          else result.push(text);
        }
        return result;
      }
      const texts = await openGroup(messages);
      if (current !== epoch) return;
      $("read-text").textContent = texts.join("\n\n");
      $("reader-title").textContent = texts.length > 1 ? `${texts.length} messages opened.` : encrypted ? "Just between you." : "Decoded, not private.";
      $("reader-meta").textContent = encrypted ? "Decrypted here \xB7 each message authenticated" : "Encoding only \xB7 no key required";
      $("reply").hidden = false;
      lastWire = wire;
      pendingWire = "";
      status(encrypted ? "Plaintext stays inside this keyboard." : "Anyone with this encoding can read the message.");
      touch();
    } catch (error) {
      if (current === epoch) {
        $("reader-title").textContent = "Couldn\u2019t open this message.";
        $("reader-meta").textContent = "No plaintext has been revealed.";
        $("read-error").textContent = error.message;
      }
    } finally {
      if (current === epoch) setBusy(false);
    }
  }
  function clearReader() {
    $("read-text").textContent = "";
    $("read-error").textContent = "";
    $("reply").hidden = true;
    $("reader-title").textContent = "Read between the lines.";
    $("reader-meta").textContent = "Copy a message, then open it here.";
  }
  function lock(message = "Locked. Your key and private text were cleared from this session.") {
    ++epoch;
    secret = "";
    rawDraft = "";
    pendingWire = "";
    lastWire = "";
    plainMode = false;
    shift = 0;
    emojiOpen = false;
    symbols = false;
    symbolAlt = false;
    $("shared-key").value = "";
    $("show-key").checked = false;
    $("shared-key").type = "password";
    clearTimeout(expiry);
    clearReader();
    renderDraft();
    setBusy(false);
    show("compose");
    keys();
    updateMode();
    status(message);
    request("lock").catch(() => {
    });
  }
  function keys() {
    const rows = emojiOpen ? [
      ["\u{1F600}", "\u{1F603}", "\u{1F604}", "\u{1F601}", "\u{1F605}", "\u{1F602}", "\u{1F642}", "\u{1F643}"],
      ["\u2764\uFE0F", "\u{1F60D}", "\u{1F622}", "\u{1F62D}", "\u{1F60E}", "\u{1F914}", "\u{1F440}", "\u{1F525}"],
      ["\u{1F44D}", "\u{1F44E}", "\u{1F64F}", "\u{1F389}", "\u{1F510}", "\u{1F331}", "\u2728", "\u{1F4AC}"]
    ] : symbols ? symbolAlt ? ["~`|\u2022\u221A\u03C0\xF7\xD7\xA3\u20AC", "\xA9\xAE\u2122\u2713[]{}\\^", `_:;"'!?`] : ["1234567890", "@#$%&*-+=", ".,?!:;/()"] : ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
    $("key-area").replaceChildren();
    rows.forEach((row, index) => {
      const line = document.createElement("div");
      line.className = "key-row" + (index === 1 ? " inset" : "");
      if (index === 2 && symbols) line.append(key(symbolAlt ? "123" : "#+=", "More symbols", () => {
        symbolAlt = !symbolAlt;
        keys();
      }, "wide small"));
      else if (index === 2 && !emojiOpen) {
        const button = key(shift === 2 ? "\u21EA" : "\u21E7", shift === 2 ? "Caps lock on" : "Shift", () => {
          shift = (shift + 1) % 3;
          keys();
        }, "wide shift" + (shift ? " selected" : ""));
        button.setAttribute("aria-pressed", String(shift > 0));
        line.append(button);
      }
      for (const c of row) line.append(key(shift && !symbols && !emojiOpen ? c.toUpperCase() : c, c, () => type(shift && !symbols && !emojiOpen ? c.toUpperCase() : c), emojiOpen ? "emoji" : ""));
      if (index === 2) line.append(key("\u232B", "Backspace", backspace, "wide"));
      $("key-area").append(line);
    });
    const bottom = document.createElement("div");
    bottom.className = "key-row";
    bottom.append(key(symbols ? "ABC" : "123", "Numbers and symbols", () => {
      symbols = !symbols;
      symbolAlt = false;
      emojiOpen = false;
      keys();
    }, "wide small"));
    bottom.append(key(language === "en" ? "\u09AC\u09BE\u0982\u09B2\u09BE" : "EN", "Change typing language", () => {
      rawDraft = $("draft").value;
      language = language === "en" ? "bn" : "en";
      keys();
    }, "wide small"));
    bottom.append(key(emojiOpen ? "ABC" : "\u263A", "Emoji keyboard", () => {
      emojiOpen = !emojiOpen;
      symbols = false;
      symbolAlt = false;
      keys();
    }, "wide small"));
    bottom.append(key("space", "Space", () => type(" "), "space"));
    bottom.append(key("\u21B5", "New line", () => type("\n"), "wide return"));
    $("key-area").append(bottom);
  }
  function key(label, name, action, extra = "") {
    const button = document.createElement("button");
    button.className = `key ${extra}`;
    button.textContent = label;
    button.setAttribute("aria-label", name);
    button.addEventListener("pointerdown", (e) => e.preventDefault());
    button.addEventListener("click", () => {
      touch();
      action();
    });
    return button;
  }
  function type(value) {
    if (busy) return;
    const oneShot = shift === 1 && /^[A-Z]$/.test(value) && !symbols && !emojiOpen;
    const finishShift = () => {
      if (oneShot) {
        shift = 0;
        keys();
      }
    };
    if (panel === "settings") {
      const field = $("shared-key"), start = field.selectionStart ?? field.value.length, end = field.selectionEnd ?? start;
      field.value = field.value.slice(0, start) + value + field.value.slice(end);
      field.setSelectionRange(start + value.length, start + value.length);
      finishShift();
      return;
    }
    if (plainMode) {
      request("plain", { text: value }).catch((e) => status(e.message, true));
      finishShift();
      return;
    }
    if (utf82.encode(rawDraft + value).length > MAX_BYTES) {
      status("Your draft is at the 4,096-byte limit.", true);
      return;
    }
    if (language === "bn") {
      rawDraft += value;
      renderDraft();
    } else {
      const field = $("draft"), start = field.selectionStart ?? rawDraft.length, end = field.selectionEnd ?? start;
      rawDraft = field.value.slice(0, start) + value + field.value.slice(end);
      renderDraft();
      field.setSelectionRange(start + value.length, start + value.length);
    }
    finishShift();
  }
  function backspace() {
    if (busy) return;
    if (plainMode && panel !== "settings") {
      request("backspace").catch((e) => status(e.message, true));
      return;
    }
    const field = panel === "settings" ? $("shared-key") : $("draft");
    if (panel !== "settings" && language === "bn") {
      const segments = [...new Intl.Segmenter(void 0, { granularity: "grapheme" }).segment(rawDraft)];
      rawDraft = rawDraft.slice(0, segments.at(-1)?.index ?? 0);
      renderDraft();
      return;
    }
    let start = field.selectionStart ?? field.value.length, end = field.selectionEnd ?? start;
    if (start === end && start > 0) {
      const segments = [...new Intl.Segmenter(void 0, { granularity: "grapheme" }).segment(field.value.slice(0, start))];
      start = segments.at(-1)?.index ?? 0;
    }
    field.value = field.value.slice(0, start) + field.value.slice(end);
    field.setSelectionRange(start, start);
    if (panel !== "settings") rawDraft = field.value;
  }
  $("draft").addEventListener("input", () => {
    rawDraft = $("draft").value;
    touch();
  });
  $("draft").addEventListener("keydown", (e) => {
    if (language !== "bn") return;
    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter") {
      e.preventDefault();
      e.key === "Backspace" ? backspace() : type(e.key === "Enter" ? "\n" : e.key);
    }
  });
  $("encrypt").onclick = insert;
  $("settings").onclick = () => {
    if (!busy) openSettings();
  };
  $("mode-pill").onclick = () => {
    if (!busy) openModes("compose");
  };
  $("method-picker").onclick = () => openModes("settings");
  $("close-modes").onclick = () => show(modeReturn);
  $("shared-key").addEventListener("focus", () => {
    if (panel !== "settings") return;
    settingsKeypad = true;
    show("settings");
    requestAnimationFrame(() => {
      const container = $("settings-panel"), field = $("shared-key");
      container.scrollTop += field.getBoundingClientRect().top - container.getBoundingClientRect().top - 25;
    });
  });
  $("keypad-done").onclick = () => {
    $("shared-key").blur();
    settingsKeypad = false;
    show("settings");
  };
  $("close-settings").onclick = () => {
    $("shared-key").value = "";
    show("compose");
  };
  $("lock").onclick = () => lock();
  $("reply").onclick = () => {
    clearReader();
    plainMode = false;
    method = "secure";
    $("method").value = "secure";
    methodChanged();
    updateMode();
    show("compose");
  };
  $("plain-mode").onclick = () => {
    if (busy) return;
    if (!plainMode && rawDraft) {
      status("Encrypt your draft or use Lock to clear it before switching to normal typing.", true);
      return;
    }
    plainMode = !plainMode;
    rawDraft = "";
    renderDraft();
    updateMode();
    status(plainMode ? "Normal typing is visible to the app. Private drafts stay in Private mode." : "Your words stay here until you encrypt.");
  };
  $("paste-draft").onclick = async () => {
    if (busy || plainMode) return;
    if (rawDraft) {
      status("Encrypt or clear your current draft before pasting another message.", true);
      return;
    }
    const current = epoch;
    try {
      const copied = (await request("clipboard")).trim();
      if (current !== epoch) return;
      for (const item of parseMessages(copied)) item.startsWith("GK1.") ? parseEnvelope(item) : decode(item);
      checkText(copied);
      rawDraft = copied;
      language = "en";
      emojiOpen = false;
      symbols = false;
      symbolAlt = false;
      shift = 0;
      keys();
      renderDraft();
      status("Ciphertext is in your private draft. Encrypt & insert to add a layer.");
    } catch (error) {
      if (current === epoch) status(error.message, true);
    }
  };
  for (const [value, label, detail] of MODES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode-option";
    button.dataset.mode = value;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", "false");
    const title = document.createElement("strong");
    title.textContent = label;
    const subtitle = document.createElement("span");
    subtitle.textContent = detail;
    button.append(title, subtitle);
    $("mode-options").append(button);
    button.onclick = async () => {
      $("method").value = value;
      methodChanged();
      if (modeReturn === "compose" && (value !== "secure" || secret)) {
        method = value;
        updateMode();
        show("compose");
        try {
          await request("autoRead", { enabled: autoRead, method });
        } catch (error) {
          status(error.message, true);
        }
      } else show("settings");
    };
  }
  $("generate").onclick = async () => {
    const current = epoch;
    try {
      const value = await request("generate");
      if (current !== epoch) return;
      $("shared-key").value = value;
      status("New random key generated. Show it to your friend in person.");
    } catch (e) {
      if (current === epoch) status(e.message, true);
    }
  };
  $("show-key").onchange = () => {
    $("shared-key").type = $("show-key").checked ? "text" : "password";
  };
  $("paste-key").onclick = async () => {
    const current = epoch;
    try {
      const value = await request("clipboard");
      if (current !== epoch) return;
      checkSecret(value);
      $("shared-key").value = value;
    } catch (e) {
      if (current === epoch) status(e.message, true);
    }
  };
  $("restore-key").onclick = async () => {
    const current = epoch;
    try {
      const value = await request("loadKey");
      if (current !== epoch) return;
      if (!value) throw new Error("No key saved on this device.");
      $("shared-key").value = value;
      status("Saved key loaded. Tap Use these settings to unlock.");
    } catch (e) {
      if (current === epoch) status(e.message, true);
    }
  };
  $("forget-key").onclick = async () => {
    try {
      await request("forgetKey");
      $("remember").checked = false;
      status("Saved key removed. The active session key remains until you lock.");
    } catch (e) {
      status(e.message, true);
    }
  };
  $("save-settings").onclick = async () => {
    let current = epoch;
    try {
      const nextMethod = $("method").value, value = $("shared-key").value;
      if (nextMethod === "secure") checkSecret(value);
      if ($("remember").checked && nextMethod === "secure") await request("saveKey", { secret: value });
      if (current !== epoch) return;
      current = ++epoch;
      method = nextMethod;
      secret = value;
      autoRead = $("auto-read").checked;
      await request("autoRead", { enabled: autoRead, method });
      if (current !== epoch) return;
      $("shared-key").value = "";
      $("show-key").checked = false;
      $("shared-key").type = "password";
      plainMode = false;
      methodChanged();
      updateMode();
      show("compose");
      touch();
      status(method === "secure" ? "Key ready. Type privately, then encrypt." : "Encoding selected. This mode does not protect secrets.");
      if (pendingWire) await read(pendingWire);
    } catch (error) {
      if (current === epoch) status(error.message, true);
    }
  };
  var readClipboard = async () => {
    try {
      await read(await request("clipboard"));
    } catch (e) {
      status("Clipboard access unavailable. Allow access in system settings, then try again.", true);
    }
  };
  $("read-clipboard").onclick = readClipboard;
  $("read-copied").onclick = readClipboard;
  $("next-keyboard").onclick = () => {
    lock();
    request("next").catch((e) => status(e.message, true));
  };
  window.gachlaganClipboard = (wire) => read(wire, true);
  window.gachlaganLock = () => lock("Locked when the keyboard was hidden.");
  window.gachlaganHardwareKey = (value) => value === "\b" ? backspace() : type(value);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) lock();
  });
  window.addEventListener("pagehide", () => lock());
  document.addEventListener("pointerdown", touch, { passive: true });
  document.addEventListener("keydown", touch);
  if (!native) {
    $("remember-row").hidden = true;
    $("restore-key").hidden = true;
    $("forget-key").hidden = true;
    window.addEventListener("message", (e) => {
      if (e.origin !== window.location.origin || e.source !== window.parent || e.data?.source !== "gachlagan-preview") return;
      if (e.data.op === "clipboard") {
        window.gachlaganPreviewClipboard = e.data.text;
        read(e.data.text, true);
      }
    });
  }
  keys();
  methodChanged();
  updateMode();
  touch();
  if (native) request("loadSettings").then((settings) => {
    if (!settings || !["secure", ...ENCODING_MODES].includes(settings.method)) return;
    method = settings.method;
    autoRead = Boolean(settings.autoRead);
    $("method").value = method;
    $("auto-read").checked = autoRead;
    methodChanged();
    updateMode();
  }).catch(() => status("Settings unavailable. Private mode remains selected."));
})();
