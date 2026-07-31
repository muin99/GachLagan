package com.gachlagan.keyboard;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Only the encrypted secret is persisted. The wrapping key stays in AndroidKeyStore. */
final class KeyVault {
  private static final String ALIAS = "gachlagan.shared-key.v1";
  private final Context context;
  KeyVault(Context context) { this.context = context; }
  private SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
    if (!store.containsAlias(ALIAS)) {
      KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
        .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
      generator.generateKey();
    }
    return (SecretKey) store.getKey(ALIAS, null);
  }
  synchronized void save(String secret) throws Exception {
    MessageCrypto.keyKind(secret); byte[] plain = secret.getBytes(StandardCharsets.UTF_8);
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
      cipher.updateAAD(ALIAS.getBytes(StandardCharsets.UTF_8));
      String value = MessageCrypto.b64(cipher.getIV()) + "." + MessageCrypto.b64(cipher.doFinal(plain));
      if (!context.getSharedPreferences("vault", Context.MODE_PRIVATE).edit().putString("wrapped", value).commit()) throw new IllegalStateException("Could not save key.");
    } finally { Arrays.fill(plain, (byte)0); }
  }
  synchronized String load() throws Exception {
    String value = context.getSharedPreferences("vault", Context.MODE_PRIVATE).getString("wrapped", "");
    if (value.isEmpty()) return "";
    String[] parts = value.split("\\."); if (parts.length != 2) throw new IllegalStateException("Saved key is unavailable. Enter it again.");
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, MessageCrypto.unb64(parts[0])));
    cipher.updateAAD(ALIAS.getBytes(StandardCharsets.UTF_8)); byte[] plain = cipher.doFinal(MessageCrypto.unb64(parts[1]));
    try { return new String(plain, StandardCharsets.UTF_8); } finally { Arrays.fill(plain, (byte)0); }
  }
  synchronized void forget() throws Exception {
    if (!context.getSharedPreferences("vault", Context.MODE_PRIVATE).edit().clear().commit()) throw new IllegalStateException("Could not remove saved key.");
    KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); store.deleteEntry(ALIAS);
  }
}
