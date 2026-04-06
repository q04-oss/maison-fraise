import UIKit
import ARKit
import SceneKit

class ARBoxViewController: UIViewController, ARSCNViewDelegate {

  private let sceneView = ARSCNView()
  private let varietyData: NSDictionary
  private let onDismiss: () -> Void
  private var dismissTimer: Timer?

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

    let cardView = ARCardView(
      name: name,
      farm: farm,
      harvestDate: harvestDate,
      quantity: quantity,
      chocolate: chocolate,
      finish: finish
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

    let cardNode = SCNNode(geometry: plane)
    cardNode.position = SCNVector3(0, 0, -0.55)

    let billboard = SCNBillboardConstraint()
    billboard.freeAxes = .Y
    cardNode.constraints = [billboard]

    sceneView.scene.rootNode.addChildNode(cardNode)
  }

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
