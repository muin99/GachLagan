//
//  ViewController.swift
//  KMSample2
//
//  Created by Gabriel Wong on 2017-10-06.
//  Copyright © 2017 SIL International. All rights reserved.
//

import KeymanEngine
import UIKit

class ViewController: UIViewController, TextViewDelegate {
  @IBOutlet var textView: TextView!

  override func viewDidLoad() {
    super.viewDidLoad()
    Manager.shared.isKeymanHelpOn = false

    let kmpFileURL = Bundle.main.url(forResource: "avro_phonetic", withExtension: "kmp")!
    let keyboardID = FullKeyboardID(keyboardID: "avro_phonetic", languageID: "bn")

    do {
      let package = try ResourceFileManager.shared.prepareKMPInstall(from: kmpFileURL) as! KeyboardKeymanPackage
      try ResourceFileManager.shared.install(resourceWithID: keyboardID, from: package)

      _ = Manager.shared.setKeyboard(withFullID: keyboardID)
    } catch {
      print("Error preloading: \(error)")
    }

    textView.becomeFirstResponder()
    textView.setKeymanDelegate(self)
    textView.viewController = self
  }
}
