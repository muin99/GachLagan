import Foundation
import Security

enum KeyVault {
  private static let identity: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.gachlagan.keyboard.shared-key.v1", kSecAttrAccount as String: "active"]
  static func save(_ secret: String) throws {
    _ = try MessageCrypto.keyKind(secret)
    let attributes: [String: Any] = [kSecValueData as String: Data(secret.utf8), kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly, kSecAttrSynchronizable as String: false]
    let status = SecItemUpdate(identity as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
      var query = identity; attributes.forEach { query[$0.key] = $0.value }
      guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else { throw MessageCrypto.Failure("Could not save key in Keychain.") }
    } else if status != errSecSuccess { throw MessageCrypto.Failure("Could not update the saved key.") }
  }
  static func load() throws -> String {
    var query = identity; query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return "" }
    guard status == errSecSuccess, let data = item as? Data, let secret = String(data: data, encoding: .utf8) else { throw MessageCrypto.Failure("Saved key unavailable. Unlock your device or enter the key again.") }
    return secret
  }
  static func forget() throws {
    let status = SecItemDelete(identity as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { throw MessageCrypto.Failure("Could not remove saved key.") }
  }
}
