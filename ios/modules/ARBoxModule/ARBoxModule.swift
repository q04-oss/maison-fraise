import Foundation
import UIKit

@objc(ARBoxModule)
class ARBoxModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { return true }

  private func topViewController() -> UIViewController? {
    guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
          let rootVC = scene.keyWindow?.rootViewController else { return nil }
    var topVC = rootVC
    while let presented = topVC.presentedViewController {
      topVC = presented
    }
    return topVC
  }

  @objc func presentAR(
    _ varietyData: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let topVC = self?.topViewController() else {
        reject("NO_ROOT_VC", "No root view controller found", nil)
        return
      }
      var resolved = false
      let arVC = ARBoxViewController(varietyData: varietyData) {
        if !resolved { resolved = true; resolve(nil) }
      }
      arVC.onTastingRating = { rating, notes in
        if !resolved { resolved = true; resolve(["rating": rating, "notes": notes as Any]) }
      }
      arVC.modalPresentationStyle = .fullScreen
      topVC.present(arVC, animated: true)
    }
  }

  // Feature E: Staff AR scanning
  @objc func presentStaffAR(
    _ staffData: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let topVC = self?.topViewController() else {
        reject("NO_ROOT_VC", "No root view controller found", nil)
        return
      }
      let arVC = ARBoxViewController(varietyData: staffData) {
        // dismissed without action — resolve with nil
        resolve(nil)
      }
      arVC.staffMode = true
      arVC.staffData = staffData
      arVC.onStaffAction = { action, orderId in
        resolve(["action": action, "order_id": orderId])
      }
      arVC.modalPresentationStyle = .fullScreen
      topVC.present(arVC, animated: true)
    }
  }

  // Feature F: Market stall AR
  @objc func presentMarketStallAR(
    _ stallData: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let topVC = self?.topViewController() else {
        reject("NO_ROOT_VC", "No root view controller found", nil)
        return
      }
      let arVC = ARBoxViewController(varietyData: stallData) {
        resolve(nil)
      }
      arVC.marketStallMode = true
      arVC.modalPresentationStyle = .fullScreen
      topVC.present(arVC, animated: true)
    }
  }

  // AR Expanded: Staff batch scan mode
  @objc func presentBatchScanAR(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let topVC = self?.topViewController() else {
        reject("NO_ROOT_VC", "No root view controller found", nil)
        return
      }
      let emptyData: NSDictionary = [
        "variety_id": 0,
        "variety_name": NSNull(),
        "farm": NSNull(),
        "harvest_date": NSNull(),
        "quantity": 0,
        "chocolate": "",
        "finish": "",
      ]
      let arVC = ARBoxViewController(varietyData: emptyData) {
        resolve(nil)
      }
      arVC.staffMode = true
      arVC.batchScanMode = true
      arVC.onBatchPrepare = { orderIds in
        resolve(["order_ids": orderIds])
      }
      arVC.modalPresentationStyle = .fullScreen
      topVC.present(arVC, animated: true)
    }
  }
}
