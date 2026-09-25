package com.gachlagan.keyboard;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/** Platform cryptography only. GK1 wire format is specified in docs/SECURITY.md. */
public final class MessageCrypto {
  public static final int MAX_BYTES = 4096;
  private static final SecureRandom RANDOM = new SecureRandom();
  private static final byte[] INFO = "Gachlagan/GK1/A256GCM".getBytes(StandardCharsets.UTF_8);
  private MessageCrypto() {}
  public static byte[] random(int size) { byte[] bytes = new byte[size]; RANDOM.nextBytes(bytes); return bytes; }
  public static String b64(byte[] bytes) { return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
  public static byte[] unb64(String text) {
    if (text.length() > 8192 || !text.matches("[A-Za-z0-9_-]+")) throw new IllegalArgumentException("Invalid message format.");
    byte[] bytes = Base64.getUrlDecoder().decode(text);
    if (!b64(bytes).equals(text)) throw new IllegalArgumentException("Invalid message format.");
    return bytes;
  }
  public static String generateKey() { byte[] bytes = random(32); try { return "GKKEY1." + b64(bytes); } finally { Arrays.fill(bytes, (byte)0); } }
  public static String keyKind(String secret) {
    if (secret.startsWith("GKKEY1.")) {
      byte[] raw = unb64(secret.substring(7));
      try { if (raw.length != 32) throw new IllegalArgumentException("That shared key is incomplete."); }
      finally { Arrays.fill(raw, (byte)0); }
      return "K";
    }
    String normalized = Normalizer.normalize(secret, Normalizer.Form.NFC);
    if (normalized.codePointCount(0, normalized.length()) < 16 || normalized.getBytes(StandardCharsets.UTF_8).length > 256 || !StandardCharsets.UTF_8.newEncoder().canEncode(normalized))
      throw new IllegalArgumentException("Use a passphrase of 16+ characters, at most 256 UTF-8 bytes.");
    return "P";
  }
  private static byte[] derive(String secret, byte[] salt, String kind) throws Exception {
    if (!keyKind(secret).equals(kind)) throw new IllegalArgumentException("This message needs a different type of shared key.");
    if (kind.equals("P")) {
      char[] chars = Normalizer.normalize(secret, Normalizer.Form.NFC).toCharArray();
      PBEKeySpec spec = new PBEKeySpec(chars, salt, 600000, 256);
      try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
      finally { spec.clearPassword(); Arrays.fill(chars, '\0'); }
    }
    // RFC 5869 HKDF-SHA256, one 32-byte output block. JCA supplies HMAC.
    byte[] raw = unb64(secret.substring(7)), prk = null;
    try {
      Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(salt, "HmacSHA256")); prk = mac.doFinal(raw);
      mac.init(new SecretKeySpec(prk, "HmacSHA256")); mac.update(INFO); return mac.doFinal(new byte[]{1});
    } finally { Arrays.fill(raw, (byte)0); if (prk != null) Arrays.fill(prk, (byte)0); }
  }
  public static String seal(String text, String secret) throws Exception {
    byte[] plain = text.getBytes(StandardCharsets.UTF_8);
    if (plain.length < 1 || plain.length > MAX_BYTES || !StandardCharsets.UTF_8.newEncoder().canEncode(text)) throw new IllegalArgumentException("Write a message of 1–4,096 UTF-8 bytes.");
    String kind = keyKind(secret); byte[] salt = random(16), nonce = random(12), key = derive(secret, salt, kind);
    String header = "GK1." + kind + "." + b64(salt) + "." + b64(nonce);
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
      cipher.updateAAD(header.getBytes(StandardCharsets.UTF_8)); return header + "." + b64(cipher.doFinal(plain));
    } finally { Arrays.fill(key, (byte)0); Arrays.fill(plain, (byte)0); }
  }
  public static String open(String wire, String secret) throws Exception {
    if (wire.length() > 40000) throw new IllegalArgumentException("Message is too large.");
    String[] parts = wire.trim().split("\\.", -1);
    if (parts.length != 5 || !parts[0].equals("GK1") || !(parts[1].equals("K") || parts[1].equals("P"))) throw new IllegalArgumentException("Not a supported encrypted message.");
    byte[] salt = unb64(parts[2]), nonce = unb64(parts[3]), cipherText = unb64(parts[4]);
    if (salt.length != 16 || nonce.length != 12 || cipherText.length < 17 || cipherText.length > MAX_BYTES + 16) throw new IllegalArgumentException("The message is incomplete or too large.");
    byte[] key = derive(secret, salt, parts[1]), plain = null;
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
      cipher.updateAAD(String.join(".", Arrays.copyOf(parts, 4)).getBytes(StandardCharsets.UTF_8)); plain = cipher.doFinal(cipherText);
      return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(plain)).toString();
    } catch (Exception e) { throw new IllegalArgumentException("Cannot unlock: the key is different or this message was changed."); }
    finally { Arrays.fill(key, (byte)0); if (plain != null) Arrays.fill(plain, (byte)0); }
  }
}
