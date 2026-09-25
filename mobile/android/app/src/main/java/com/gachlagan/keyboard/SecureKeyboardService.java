package com.gachlagan.keyboard;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.inputmethodservice.InputMethodService;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** All UI assets are bundled. This service cannot access the network. */
public final class SecureKeyboardService extends InputMethodService {
  private static final String URL = "https://appassets.androidplatform.net/assets/secure/index.html";
  private final Handler main = new Handler(Looper.getMainLooper());
  private final ThreadPoolExecutor work = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(4));
  private WebView web;
  private ClipboardManager clipboard;
  private KeyVault vault;
  private boolean visible, autoRead = true, sensitiveField;
  private int generation;
  private final ClipboardManager.OnPrimaryClipChangedListener listener = this::readAutomatically;

  @Override public void onCreate() {
    super.onCreate(); vault = new KeyVault(this);
    autoRead = getSharedPreferences("settings", MODE_PRIVATE).getBoolean("autoRead", true);
    clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
    clipboard.addPrimaryClipChangedListener(listener);
  }
  @Override public View onCreateInputView() {
    if (web != null) { web.removeJavascriptInterface("GachlaganNative"); web.destroy(); }
    web = new WebView(this); web.setBackgroundColor(Color.rgb(23, 27, 39));
    web.setLayoutParams(new android.widget.LinearLayout.LayoutParams(-1, Math.round(420 * getResources().getDisplayMetrics().density)));
    web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
    WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(false);
    settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setBlockNetworkLoads(true);
    settings.setCacheMode(WebSettings.LOAD_NO_CACHE); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setSaveFormData(false); settings.setJavaScriptCanOpenWindowsAutomatically(false);
    // Needed only for the emulator E2E harness. Release builds never expose DevTools.
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
    WebViewAssetLoader assets = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceResponse response = assets.shouldInterceptRequest(request.getUrl());
        return response != null ? response : new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
      }
      @Override public void onPageFinished(WebView view, String url) { if (visible) readAutomatically(); }
    });
    web.setOnLongClickListener(v -> true); web.addJavascriptInterface(new Bridge(), "GachlaganNative"); web.loadUrl(URL);
    return web;
  }
  @Override public void onStartInput(EditorInfo info, boolean restarting) {
    super.onStartInput(info, restarting); generation++;
    int variation = info.inputType & InputType.TYPE_MASK_VARIATION;
    sensitiveField = variation == InputType.TYPE_TEXT_VARIATION_PASSWORD || variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD || variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD || ((info.inputType & InputType.TYPE_MASK_CLASS) == InputType.TYPE_CLASS_NUMBER && variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD);
    if (web != null) web.evaluateJavascript("window.gachlaganLock&&window.gachlaganLock()", null);
  }
  @Override public void onStartInputView(EditorInfo info, boolean restarting) {
    super.onStartInputView(info, restarting); visible = true;
    getWindow().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    readAutomatically();
  }
  @Override public void onFinishInputView(boolean finishingInput) {
    visible = false; generation++;
    if (web != null) web.evaluateJavascript("window.gachlaganLock&&window.gachlaganLock()", null);
    super.onFinishInputView(finishingInput);
  }
  @Override public void onFinishInput() { visible = false; generation++; super.onFinishInput(); }
  @Override public boolean onEvaluateFullscreenMode() { return false; }
  @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
    if (visible && web != null) {
      if (keyCode == KeyEvent.KEYCODE_BACK) { requestHideSelf(0); return true; }
      String value = keyCode == KeyEvent.KEYCODE_DEL ? "\b" : keyCode == KeyEvent.KEYCODE_ENTER ? "\n" : event.getUnicodeChar() != 0 ? new String(Character.toChars(event.getUnicodeChar())) : "";
      if (!value.isEmpty()) { web.evaluateJavascript("window.gachlaganHardwareKey(" + JSONObject.quote(value) + ")", null); return true; }
    }
    return super.onKeyDown(keyCode, event);
  }
  private String copied() {
    ClipData clip = clipboard.getPrimaryClip();
    if (clip == null || clip.getItemCount() != 1 || clip.getItemAt(0).getText() == null) return "";
    CharSequence text = clip.getItemAt(0).getText();
    if (text.length() > 40000) throw new IllegalArgumentException("Clipboard message is too large.");
    return text.toString();
  }
  private void readAutomatically() {
    if (!visible || !autoRead || sensitiveField || web == null) return;
    try { String value = copied(); String trimmed = value.trim(); if (trimmed.startsWith("GK1.") || trimmed.startsWith("GE1.") || trimmed.startsWith("[[GK2:") || trimmed.startsWith("[[GE2:")) web.evaluateJavascript("window.gachlaganClipboard&&window.gachlaganClipboard(" + JSONObject.quote(value) + ")", null); }
    catch (Exception ignored) { /* Denied clipboard access is not an error to log with content. */ }
  }
  private void respond(int id, Object result, String error, int session) {
    main.post(() -> {
      if (web == null || session != generation || !visible) return;
      JSONObject response = new JSONObject();
      try { response.put("id", id); if (error == null) response.put("result", result); else response.put("error", error); }
      catch (Exception ignored) { return; }
      web.evaluateJavascript("window.gachlaganResolve(" + response + ")", null);
    });
  }
  private final class Bridge {
    @JavascriptInterface public void postMessage(String json) {
      if (json == null || json.length() > 60000) return;
      main.post(() -> handle(json));
    }
  }
  private void handle(String json) {
    if (!visible) return;
    int id = -1, session = generation;
    try {
      JSONObject message = new JSONObject(json); id = message.getInt("id"); String op = message.getString("op");
      if (op.equals("seal") || op.equals("open") || op.equals("generate") || op.equals("saveKey") || op.equals("loadKey") || op.equals("forgetKey")) {
        final int requestId = id, workerSession = session;
        work.execute(() -> {
          try {
            Object result;
            switch (op) {
              case "seal": result = MessageCrypto.seal(message.getString("text"), message.getString("secret")); break;
              case "open": result = MessageCrypto.open(message.getString("wire"), message.getString("secret")); break;
              case "generate": result = MessageCrypto.generateKey(); break;
              case "saveKey": vault.save(message.getString("secret")); result = true; break;
              case "loadKey": result = vault.load(); break;
              default: vault.forget(); result = true;
            }
            respond(requestId, result, null, workerSession);
          } catch (Exception e) { respond(requestId, null, e instanceof IllegalArgumentException ? e.getMessage() : "Secure operation failed. Your draft was not sent.", workerSession); }
        }); return;
      }
      Object result = true;
      switch (op) {
        case "insert": case "plain": {
          if (sensitiveField) throw new IllegalArgumentException("This keyboard does not insert into password fields.");
          String text = message.getString("text");
          if (text.length() > 40000 || (op.equals("insert") && !text.startsWith("[[GK2:") && !text.startsWith("[[GE2:"))) throw new IllegalArgumentException("Invalid output.");
          InputConnection connection = getCurrentInputConnection();
          if (connection == null || !connection.commitText(text, 1)) throw new IllegalArgumentException("The app did not accept the message. Your draft is still here."); break;
        }
        case "backspace": {
          InputConnection connection = getCurrentInputConnection();
          if (connection != null) {
            CharSequence before = connection.getTextBeforeCursor(64, 0);
            if (before != null && before.length() > 0) {
              android.icu.text.BreakIterator iterator = android.icu.text.BreakIterator.getCharacterInstance();
              iterator.setText(before.toString()); int start = iterator.preceding(before.length());
              int count = Character.codePointCount(before, Math.max(0, start), before.length());
              connection.deleteSurroundingTextInCodePoints(Math.max(1, count), 0);
            }
          }
          break;
        }
        case "clipboard": result = copied(); break;
        case "autoRead": {
          String method = message.optString("method", "secure");
          if (!java.util.Arrays.asList("secure", "binary", "hex", "octal", "decimal", "base32", "base64", "base64classic", "percent", "rot13", "morse").contains(method)) throw new IllegalArgumentException("Unknown mode.");
          autoRead = message.getBoolean("enabled");
          getSharedPreferences("settings", MODE_PRIVATE).edit().putString("method", method).putBoolean("autoRead", autoRead).apply(); break;
        }
        case "loadSettings": {
          android.content.SharedPreferences saved = getSharedPreferences("settings", MODE_PRIVATE);
          autoRead = saved.getBoolean("autoRead", true);
          result = new JSONObject().put("method", saved.getString("method", "secure")).put("autoRead", autoRead); break;
        }
        case "lock": generation++; session = generation; break;
        case "next": ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showInputMethodPicker(); break;
        default: throw new IllegalArgumentException("Unknown keyboard action.");
      }
      respond(id, result, null, session);
      if (op.equals("autoRead") || op.equals("loadSettings")) main.post(this::readAutomatically);
    } catch (Exception e) { respond(id, null, e instanceof IllegalArgumentException ? e.getMessage() : "Keyboard action unavailable.", session); }
  }
  @Override public void onDestroy() {
    visible = false; generation++; clipboard.removePrimaryClipChangedListener(listener); work.shutdownNow();
    if (web != null) { web.removeJavascriptInterface("GachlaganNative"); web.destroy(); web = null; }
    super.onDestroy();
  }
}
