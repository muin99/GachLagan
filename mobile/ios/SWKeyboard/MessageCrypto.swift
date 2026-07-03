import Foundation
import CryptoKit
import CommonCrypto
import Security

enum MessageCrypto {
  static let maxBytes = 4096
  struct Failure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
    init(_ message: String) { self.message = message }
  }
  static func b64(_ data: Data) -> String { data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
  static func unb64(_ text: String) throws -> Data {
    guard !text.isEmpty, text.count <= 8192, text.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else { throw Failure("Invalid message format.") }
    let padded = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/") + String(repeating: "=", count: (4 - text.count % 4) % 4)
    guard let data = Data(base64Encoded: padded), b64(data) == text else { throw Failure("Invalid message format.") }; return data
  }
  static func random(_ count: Int) throws -> Data {
    var data = Data(count: count)
    let result = data.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!) }
    guard result == errSecSuccess else { throw Failure("Secure random generation failed.") }; return data
  }
  static func generateKey() throws -> String { "GKKEY1." + b64(try random(32)) }
  static func keyKind(_ secret: String) throws -> String {
    if secret.hasPrefix("GKKEY1.") {
      guard try unb64(String(secret.dropFirst(7))).count == 32 else { throw Failure("That shared key is incomplete.") }; return "K"
    }
    let normalized = secret.precomposedStringWithCanonicalMapping
    guard normalized.unicodeScalars.count >= 16, normalized.utf8.count <= 256 else { throw Failure("Use a passphrase of 16+ characters, at most 256 UTF-8 bytes.") }; return "P"
  }
  static func derive(_ secret: String, salt: Data, kind: String) throws -> SymmetricKey {
    guard try keyKind(secret) == kind else { throw Failure("This message needs a different type of shared key.") }
    if kind == "K" {
      return HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: try unb64(String(secret.dropFirst(7)))), salt: salt, info: Data("Gachlagan/GK1/A256GCM".utf8), outputByteCount: 32)
    }
    var password = Array(secret.precomposedStringWithCanonicalMapping.utf8), key = [UInt8](repeating: 0, count: 32)
    defer { password.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) }; key.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) } }
    let count = password.count
    let status = password.withUnsafeBytes { pass in salt.withUnsafeBytes { saltBytes in
      CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), pass.baseAddress!.assumingMemoryBound(to: Int8.self), count, saltBytes.baseAddress!.assumingMemoryBound(to: UInt8.self), salt.count, CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 600000, &key, 32)
    } }
    guard status == kCCSuccess else { throw Failure("Key derivation failed.") }; return SymmetricKey(data: key)
  }
  static func seal(_ text: String, secret: String) throws -> String {
    guard !text.isEmpty, text.utf8.count <= maxBytes else { throw Failure("Write a message of 1–4,096 UTF-8 bytes.") }
    let kind = try keyKind(secret), salt = try random(16), nonce = try random(12)
    let header = "GK1.\(kind).\(b64(salt)).\(b64(nonce))", key = try derive(secret, salt: salt, kind: kind)
    let box = try AES.GCM.seal(Data(text.utf8), using: key, nonce: AES.GCM.Nonce(data: nonce), authenticating: Data(header.utf8))
    return header + "." + b64(box.ciphertext + box.tag)
  }
  static func open(_ wire: String, secret: String) throws -> String {
    guard wire.utf8.count <= 40000 else { throw Failure("Message is too large.") }
    let parts = wire.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: ".")
    guard parts.count == 5, parts[0] == "GK1", ["K", "P"].contains(parts[1]) else { throw Failure("Not a supported encrypted message.") }
    let salt = try unb64(parts[2]), nonce = try unb64(parts[3]), ciphertext = try unb64(parts[4])
    guard salt.count == 16, nonce.count == 12, ciphertext.count >= 17, ciphertext.count <= maxBytes + 16 else { throw Failure("The message is incomplete or too large.") }
    let key = try derive(secret, salt: salt, kind: parts[1])
    do {
      let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: nonce), ciphertext: ciphertext.dropLast(16), tag: ciphertext.suffix(16))
      var plain = try AES.GCM.open(box, using: key, authenticating: Data(parts.prefix(4).joined(separator: ".").utf8))
      defer { plain.resetBytes(in: 0..<plain.count) }
      guard let result = String(data: plain, encoding: .utf8) else { throw Failure("Invalid UTF-8.") }; return result
    } catch { throw Failure("Cannot unlock: the key is different or this message was changed.") }
  }
}
