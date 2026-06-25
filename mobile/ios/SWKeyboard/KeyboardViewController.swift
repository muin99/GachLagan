//
//  KeyboardViewController.swift
//  SWKeyboard
//
//  Created by Gabriel Wong on 2017-10-05.
//  Copyright © 2017 SIL International. All rights reserved.
//

import KeymanEngine
import UIKit

class KeyboardViewController: InputViewController {
  override init(nibName nibNameOrNil: String?, bundle nibBundleOrNil: Bundle?) {
    Manager.applicationGroupIdentifier = "group.com.gachlagan.keyboard"

    super.init(nibName: nibNameOrNil, bundle: nibBundleOrNil)
  }

  required init?(coder aDecoder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

}
