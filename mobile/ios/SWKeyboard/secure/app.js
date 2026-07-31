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
  var bases = { binary: [2, 8], octal: [8, 3], hex: [16, 2] };
  function encode(text, mode) {
    checkText(text);
    let body;
    if (mode === "morse") {
      if ([...text.toUpperCase()].some((c) => c !== " " && !MORSE[c])) throw new Error("Morse supports English letters, numbers, spaces, and common punctuation. Use binary or hex for Bangla.");
      body = [...text.toUpperCase()].map((c) => c === " " ? "/" : MORSE[c]).join(" ");
    } else if (bases[mode]) {
      const [base, width] = bases[mode];
      body = [...utf8.encode(text)].map((b) => b.toString(base).padStart(width, "0")).join(" ");
    } else if (mode === "base64") body = b64(utf8.encode(text));
    else throw new Error("Unknown encoding.");
    return `GE1.${mode}.${body}`;
  }
  function decode(wire) {
    if (typeof wire !== "string" || wire.length > MAX_WIRE) throw new Error("Message is too large.");
    const match = /^GE1\.(binary|octal|hex|base64|morse)\.([\s\S]+)$/.exec(wire.trim());
    if (!match) throw new Error("Copy the complete GE1 encoded message.");
    const [, mode, body] = match;
    let text;
    if (mode === "morse") {
      text = body.split(" ").map((code) => {
        if (code === "/") return " ";
        if (!INVERSE_MORSE[code]) throw new Error("Invalid Morse code.");
        return INVERSE_MORSE[code];
      }).join("");
    } else {
      let bytes;
      if (mode === "base64") bytes = unb64(body);
      else {
        const [base, width] = bases[mode], valid = { binary: /^[01]+$/, octal: /^[0-7]+$/, hex: /^[0-9a-f]+$/ }[mode];
        const tokens = body.split(" ");
        if (tokens.length > MAX_BYTES || tokens.some((t) => t.length !== width || !valid.test(t) || parseInt(t, base) > 255)) throw new Error("Invalid encoded bytes.");
        bytes = Uint8Array.from(tokens, (t) => parseInt(t, base));
      }
      text = decoder.decode(bytes);
    }
    checkText(text);
    return { text, mode };
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
      if (op === "clipboard") return navigator.clipboard.readText();
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
  var shift = false;
  var symbols = false;
  var plainMode = false;
  var busy = false;
  var epoch = 0;
  var rawDraft = "";
  var pendingWire = "";
  var lastWire = "";
  var autoRead = false;
  var activeField = $("draft");
  var expiry;
  var utf82 = new TextEncoder();
  function status(text, error = false) {
    $("status").textContent = text;
    $("status").classList.toggle("error", error);
  }
  function touch() {
    clearTimeout(expiry);
    expiry = setTimeout(() => lock("Locked after 60 seconds without activity."), 6e4);
  }
  function show(which) {
    panel = which;
    for (const name of ["compose", "read", "settings"]) $(name + "-panel").hidden = name !== which;
    $("key-area").hidden = which === "read";
    $("compose-tab").classList.toggle("active", which === "compose");
    $("read-tab").classList.toggle("active", which === "read");
    activeField = which === "settings" ? $("shared-key") : $("draft");
  }
  function updateMode() {
    document.body.classList.toggle("encoding", method !== "secure");
    $("mode-label").textContent = method === "secure" ? "AES-256-GCM" : `${method.toUpperCase()} \xB7 NOT PRIVATE`;
    $("encrypt-label").textContent = method === "secure" ? "Encrypt & insert" : "Encode & insert";
    $("draft-label").textContent = plainMode ? "NORMAL TYPING \xB7 VISIBLE TO APP" : "PRIVATE DRAFT";
    $("plain-mode").textContent = plainMode ? "Back to private \u2197" : "Normal typing \u2197";
    $("draft").disabled = plainMode;
    $("encrypt").hidden = plainMode;
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
      await request("insert", { text: wire });
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
    if (!/^(GK1|GE1)\./.test(wire)) {
      if (!automatic) {
        show("read");
        $("read-error").textContent = "Copy a complete GK1 encrypted or GE1 encoded message first.";
      }
      return;
    }
    if (automatic && wire === lastWire) return;
    if (wire.startsWith("GK1.") && !secret) {
      pendingWire = wire;
      show("settings");
      status("Copied message found. Enter your shared key to read it.");
      return;
    }
    const current = epoch;
    show("read");
    $("read-text").textContent = "";
    $("read-error").textContent = "";
    $("reply").hidden = true;
    $("reader-title").textContent = "Opening your message\u2026";
    try {
      setBusy(true);
      let text, encoded = wire.startsWith("GE1.");
      if (encoded) text = decode(wire).text;
      else {
        parseEnvelope(wire);
        text = await request("open", { wire, secret });
      }
      if (current !== epoch) return;
      $("read-text").textContent = text;
      $("reader-title").textContent = encoded ? "Decoded, not private." : "Just between you.";
      $("reader-meta").textContent = encoded ? "Encoding only \xB7 no key required" : "Decrypted here \xB7 authentication checked";
      $("reply").hidden = false;
      lastWire = wire;
      pendingWire = "";
      status(encoded ? "Anyone with this encoding can read the message." : "Plaintext stays inside this keyboard.");
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
    $("shared-key").value = "";
    $("show-key").checked = false;
    $("shared-key").type = "password";
    clearTimeout(expiry);
    clearReader();
    renderDraft();
    setBusy(false);
    show("compose");
    updateMode();
    status(message);
    request("lock").catch(() => {
    });
  }
  function keys() {
    const rows = symbols ? ["1234567890", "@#$%&*-+=", ".,?!:;/()"] : ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
    $("key-area").replaceChildren();
    rows.forEach((row, index) => {
      const line = document.createElement("div");
      line.className = "key-row" + (index === 1 ? " inset" : "");
      if (index === 2) line.append(key("\u21E7", "Shift", () => {
        shift = !shift;
        keys();
      }, "wide"));
      for (const c of row) line.append(key(shift && !symbols ? c.toUpperCase() : c, c, () => type(shift && !symbols ? c.toUpperCase() : c)));
      if (index === 2) line.append(key("\u232B", "Backspace", backspace, "wide"));
      $("key-area").append(line);
    });
    const bottom = document.createElement("div");
    bottom.className = "key-row";
    bottom.append(key(symbols ? "ABC" : "123", "Numbers and symbols", () => {
      symbols = !symbols;
      keys();
    }, "wide small"));
    bottom.append(key(language === "en" ? "\u09AC\u09BE\u0982\u09B2\u09BE" : "EN", "Change typing language", () => {
      rawDraft = $("draft").value;
      language = language === "en" ? "bn" : "en";
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
    if (panel === "settings") {
      const field = $("shared-key"), start = field.selectionStart ?? field.value.length, end = field.selectionEnd ?? start;
      field.value = field.value.slice(0, start) + value + field.value.slice(end);
      field.setSelectionRange(start + value.length, start + value.length);
      return;
    }
    if (plainMode) {
      request("plain", { text: value }).catch((e) => status(e.message, true));
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
  }
  function backspace() {
    if (busy) return;
    if (plainMode && panel !== "settings") {
      request("backspace").catch((e) => status(e.message, true));
      return;
    }
    const field = panel === "settings" ? $("shared-key") : $("draft");
    if (panel !== "settings" && language === "bn") {
      rawDraft = [...rawDraft].slice(0, -1).join("");
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
  $("settings").onclick = $("mode-pill").onclick = () => {
    if (busy) return;
    $("shared-key").value = secret;
    show("settings");
  };
  $("compose-tab").onclick = () => {
    clearReader();
    show("compose");
  };
  $("read-tab").onclick = () => show("read");
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
    updateMode();
    show("compose");
  };
  $("plain-mode").onclick = () => {
    if (busy) return;
    plainMode = !plainMode;
    rawDraft = "";
    renderDraft();
    updateMode();
    status(plainMode ? "Normal typing is visible to the app. Private drafts stay in Private mode." : "Your words stay here until you encrypt.");
  };
  $("method").onchange = () => {
    const secure = $("method").value === "secure";
    $("key-settings").hidden = !secure;
    $("method-help").textContent = secure ? "Authenticated encryption. Both people need the same key." : $("method").value === "morse" ? "Not private. English letters are decoded in UPPERCASE. Bangla is not supported by Morse." : "Not private. Anyone can decode this, without a key.";
  };
  $("generate").onclick = async () => {
    try {
      $("shared-key").value = await request("generate");
      status("New random key generated. Show it to your friend in person.");
    } catch (e) {
      status(e.message, true);
    }
  };
  $("show-key").onchange = () => {
    $("shared-key").type = $("show-key").checked ? "text" : "password";
  };
  $("paste-key").onclick = async () => {
    try {
      const value = await request("clipboard");
      checkSecret(value);
      $("shared-key").value = value;
    } catch (e) {
      status(e.message, true);
    }
  };
  $("restore-key").onclick = async () => {
    try {
      const value = await request("loadKey");
      if (!value) throw new Error("No key saved on this device.");
      $("shared-key").value = value;
      status("Saved key loaded. Tap Use these settings to unlock.");
    } catch (e) {
      status(e.message, true);
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
    try {
      const nextMethod = $("method").value, value = $("shared-key").value;
      if (nextMethod === "secure") checkSecret(value);
      if ($("remember").checked && nextMethod === "secure") await request("saveKey", { secret: value });
      ++epoch;
      method = nextMethod;
      secret = value;
      autoRead = $("auto-read").checked;
      await request("autoRead", { enabled: autoRead });
      $("shared-key").value = "";
      $("show-key").checked = false;
      $("shared-key").type = "password";
      plainMode = false;
      updateMode();
      show("compose");
      touch();
      status(method === "secure" ? "Key ready. Type privately, then encrypt." : "Encoding selected. This mode does not protect secrets.");
      if (pendingWire) await read(pendingWire);
    } catch (error) {
      status(error.message, true);
    }
  };
  $("read-clipboard").onclick = async () => {
    try {
      await read(await request("clipboard"));
    } catch (e) {
      status("Clipboard access unavailable. Allow access in system settings, then try again.", true);
    }
  };
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
      if (e.data.op === "clipboard") read(e.data.text, true);
    });
  }
  keys();
  updateMode();
  touch();
})();
