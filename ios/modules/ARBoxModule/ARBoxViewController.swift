import UIKit
import ARKit
import SceneKit

class ARBoxViewController: UIViewController, ARSCNViewDelegate {

  private let sceneView = ARSCNView()
  private let varietyData: NSDictionary
  private let onDismiss: () -> Void
  private var dismissTimer: Timer?

  // Feature 4: Gift reveal state
  private var isGift: Bool = false
  private var giftNote: String = ""
  private var giftCardNode: SCNNode?
  private var cardNode: SCNNode?
  private var hasRevealedGift = false

  init(varietyData: NSDictionary, onDismiss: @escaping () -> Void) {
    self.varietyData = varietyData
    self.onDismiss = onDismiss
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    setupSceneView()
    setupCard()
    setupDismissButton()
    startAutoTimer()

    // Feature 4: gift reveal tap handler
    if isGift && !giftNote.isEmpty {
      setupGiftCard()
      let tap = UITapGestureRecognizer(target: self, action: #selector(handleSceneTap))
      sceneView.addGestureRecognizer(tap)
    }

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(appDidBackground),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    let config = ARWorldTrackingConfiguration()
    config.planeDetection = [.horizontal]
    sceneView.session.run(config)
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    sceneView.session.pause()
    dismissTimer?.invalidate()
    NotificationCenter.default.removeObserver(self)
  }

  private func setupSceneView() {
    sceneView.frame = view.bounds
    sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    sceneView.delegate = self
    sceneView.showsStatistics = false
    view.addSubview(sceneView)
  }

  private func setupCard() {
    let name = (varietyData["variety_name"] as? String) ?? "Strawberry"
    let farm = (varietyData["farm"] as? String) ?? ""
    let harvestDate = (varietyData["harvest_date"] as? String) ?? ""
    let quantity = (varietyData["quantity"] as? NSNumber)?.intValue ?? 0
    let chocolate = (varietyData["chocolate"] as? String) ?? ""
    let finish = (varietyData["finish"] as? String) ?? ""
    let vitaminCMg = varietyData["vitamin_c_today_mg"] as? NSNumber
    let caloriesTodayKcal = varietyData["calories_today_kcal"] as? NSNumber
    let collectifPickupsToday = varietyData["collectif_pickups_today"] as? NSNumber
    let orderCount = varietyData["order_count"] as? NSNumber
    let cardType = (varietyData["card_type"] as? String) ?? "variety"
    let vendorDescription = varietyData["vendor_description"] as? String
    // vendor_tags arrives as NSArray from the bridge; join to comma string for ARCardView
    let vendorTagsRaw: String?
    if let tagsArray = varietyData["vendor_tags"] as? [String] {
      vendorTagsRaw = tagsArray.joined(separator: ",")
    } else {
      vendorTagsRaw = varietyData["vendor_tags"] as? String
    }

    // Feature 4: extract gift fields
    isGift = (varietyData["is_gift"] as? NSNumber)?.boolValue ?? false
    giftNote = (varietyData["gift_note"] as? String) ?? ""

    let cardView = ARCardView(
      name: name,
      farm: farm,
      harvestDate: harvestDate,
      quantity: quantity,
      chocolate: chocolate,
      finish: finish,
      vitaminCMg: vitaminCMg,
      caloriesTodayKcal: caloriesTodayKcal,
      collectifPickupsToday: collectifPickupsToday,
      orderCount: orderCount,
      cardType: cardType,
      vendorDescription: vendorDescription,
      vendorTags: vendorTagsRaw
    )
    cardView.frame = CGRect(x: 0, y: 0, width: 480, height: 320)
    cardView.layoutIfNeeded()

    let renderer = UIGraphicsImageRenderer(size: cardView.bounds.size)
    let cardImage = renderer.image { ctx in
      cardView.layer.render(in: ctx.cgContext)
    }

    let plane = SCNPlane(width: 0.30, height: 0.20)
    let material = SCNMaterial()
    material.diffuse.contents = cardImage
    material.isDoubleSided = true
    plane.materials = [material]

    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0, 0, -0.55)

    let billboard = SCNBillboardConstraint()
    billboard.freeAxes = .Y
    node.constraints = [billboard]

    // Feature 4: hide regular card if gift mode is active (revealed after tap)
    if isGift && !giftNote.isEmpty {
      node.opacity = 0
    }

    cardNode = node
    sceneView.scene.rootNode.addChildNode(node)
  }

  // MARK: - Feature 4: Gift reveal

  private func setupGiftCard() {
    let giftView = ARGiftCardView(note: giftNote)
    giftView.frame = CGRect(x: 0, y: 0, width: 480, height: 280)
    giftView.layoutIfNeeded()

    let renderer = UIGraphicsImageRenderer(size: giftView.bounds.size)
    let giftImage = renderer.image { ctx in
      giftView.layer.render(in: ctx.cgContext)
    }

    let plane = SCNPlane(width: 0.30, height: 0.175)
    let material = SCNMaterial()
    material.diffuse.contents = giftImage
    material.isDoubleSided = true
    plane.materials = [material]

    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0, 0, -0.55)

    let billboard = SCNBillboardConstraint()
    billboard.freeAxes = .Y
    node.constraints = [billboard]

    giftCardNode = node
    sceneView.scene.rootNode.addChildNode(node)
  }

  @objc private func handleSceneTap() {
    guard !hasRevealedGift else { return }
    hasRevealedGift = true
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      SCNTransaction.begin()
      SCNTransaction.animationDuration = 0.4
      self.giftCardNode?.opacity = 0
      self.cardNode?.opacity = 1
      SCNTransaction.commit()
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
        self?.giftCardNode?.removeFromParentNode()
      }
    }
  }

  // MARK: - UI setup

  private func setupDismissButton() {
    let btn = UIButton(type: .system)
    btn.setTitle("Done", for: .normal)
    btn.titleLabel?.font = UIFont.monospacedSystemFont(ofSize: 16, weight: .medium)
    btn.setTitleColor(.white, for: .normal)
    btn.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    btn.layer.cornerRadius = 20
    btn.contentEdgeInsets = UIEdgeInsets(top: 10, left: 28, bottom: 10, right: 28)
    btn.translatesAutoresizingMaskIntoConstraints = false
    btn.addTarget(self, action: #selector(handleDismiss), for: .touchUpInside)
    view.addSubview(btn)
    NSLayoutConstraint.activate([
      btn.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      btn.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
    ])
  }

  private func startAutoTimer() {
    dismissTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { [weak self] _ in
      self?.handleDismiss()
    }
  }

  @objc private func handleDismiss() {
    dismissTimer?.invalidate()
    dismiss(animated: true) { [weak self] in
      self?.onDismiss()
    }
  }

  @objc private func appDidBackground() {
    sceneView.session.pause()
  }
}
