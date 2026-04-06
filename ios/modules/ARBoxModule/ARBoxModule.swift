import Foundation
import UIKit

@objc(ARBoxModule)
class ARBoxModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { return true }

  @objc func presentAR(
    _ varietyData: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
            let rootVC = scene.keyWindow?.rootViewController else {
        reject("NO_ROOT_VC", "No root view controller found", nil)
        return
      }
      // Find topmost presented VC
      var topVC = rootVC
      while let presented = topVC.presentedViewController {
        topVC = presented
      }
      let arVC = ARBoxViewController(varietyData: varietyData) {
        resolve(nil)
      }
      arVC.modalPresentationStyle = .fullScreen
      topVC.present(arVC, animated: true)
    }
  }
}
