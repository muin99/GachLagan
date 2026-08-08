//
//  ViewController.swift
//  KMSample2
//
//  Created by Gabriel Wong on 2017-10-06.
//  Copyright © 2017 SIL International. All rights reserved.
//

import UIKit

class ViewController: UIViewController {
  @IBOutlet var textView: UITextView!

  override func viewDidLoad() {
    super.viewDidLoad()
    textView.isEditable = false
    textView.font = .preferredFont(forTextStyle: .body)
    textView.adjustsFontForContentSizeCategory = true
    textView.backgroundColor = .systemBackground
    textView.text = "Gachlagan — your words, your key.\n\n1. In Settings → General → Keyboard → Keyboards, add Gachlagan.\n\n2. Allow Full Access if you want to read copied messages. The keyboard uses no network connection. iOS may also ask for paste permission.\n\n3. Open a chat, select Gachlagan, and open its settings. Enter the same shared key on both phones.\n\nWrite in the visible Private draft. Tap Encrypt & insert, then send the ciphertext with your chat app. Copy a received encrypted message to read it inside the keyboard.\n\nBinary, hex, octal, Base64 and Morse are public encodings. Only Private mode protects a message with a key. Share keys in person. There is no key recovery."
  }
}
