import Foundation
while let line = readLine() {
  do {
    let parts = line.components(separatedBy: "\t")
    let text = String(data: Data(base64Encoded: parts[1])!, encoding: .utf8)!, secret = String(data: Data(base64Encoded: parts[2])!, encoding: .utf8)!
    let result = parts[0] == "seal" ? try MessageCrypto.seal(text, secret: secret) : try MessageCrypto.open(text, secret: secret)
    print(Data(result.utf8).base64EncodedString())
  } catch { print("ERROR") }
}
