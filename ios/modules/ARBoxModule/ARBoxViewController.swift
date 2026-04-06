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

  // Feature E: Staff mode
  var staffMode: Bool = false
  var staffData: NSDictionary?
  private var staffOverlay: ARStaffOverlay?
  var onStaffAction: ((String, Int) -> Void)?

  // Feature F: Market stall mode
  var marketStallMode: Bool = false

  // Batch scan mode
  var batchScanMode: Bool = false
  var onBatchPrepare: (([Int]) -> Void)?
  private var batchOverlay: ARBatchScanOverlay?

  // Drop alert tap callback
  var onDropAlertTap: (() -> Void)?

  // AR Expanded 3: tasting journal callback
  var onTastingRating: ((Int, String?) -> Void)?

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

    // Feature 4: gift reveal tap
    if !staffMode && !batchScanMode && isGift && !giftNote.isEmpty {
      setupGiftCard()
      let tap = UITapGestureRecognizer(target: self, action: #selector(handleSceneTap))
      sceneView.addGestureRecognizer(tap)
    }

    // Feature E: staff overlay
    if staffMode, let sd = staffData {
      let overlay = ARStaffOverlay(staffData: sd) { [weak self] action in
        guard let self = self else { return }
        let orderId = (sd["id"] as? NSNumber)?.intValue ?? 0
        self.onStaffAction?(action, orderId)
        self.handleDismiss()
      }
      overlay.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(overlay)
      NSLayoutConstraint.activate([
        overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
        overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        overlay.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -80),
      ])
      staffOverlay = overlay

      // AR Expanded 3: order routing grid (staff)
      if let slotsRaw = sd["pickup_slots"] as? [[String: Any]] {
        let slots = slotsRaw.compactMap { d -> AROrderRoutingGrid.PickupSlot? in
          guard let t = d["slot_time"] as? String else { return nil }
          return AROrderRoutingGrid.PickupSlot(
            slotTime: t,
            total: (d["total"] as? NSNumber)?.intValue ?? 0,
            paid: (d["paid"] as? NSNumber)?.intValue ?? 0,
            preparing: (d["preparing"] as? NSNumber)?.intValue ?? 0,
            ready: (d["ready"] as? NSNumber)?.intValue ?? 0
          )
        }
        if !slots.isEmpty { setupOrderRoutingGrid(slots: slots) }
      }
    }

    // Batch scan overlay
    if batchScanMode {
      let overlay = ARBatchScanOverlay()
      overlay.translatesAutoresizingMaskIntoConstraints = false
      overlay.onBulkPrepare = { [weak self] ids in
        self?.onBatchPrepare?(ids)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
          self?.batchOverlay?.markDone()
        }
      }
      overlay.onDone = { [weak self] in self?.handleDismiss() }
      view.addSubview(overlay)
      NSLayoutConstraint.activate([
        overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
        overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        overlay.heightAnchor.constraint(equalToConstant: 300),
      ])
      batchOverlay = overlay
    }

    // ── AR enrichment overlays (user mode only) ──
    if !staffMode && !marketStallMode && !batchScanMode {
      let name = (varietyData["variety_name"] as? String) ?? "Strawberry"
      let farm = (varietyData["farm"] as? String) ?? ""
      let harvestDate = varietyData["harvest_date"] as? String
      let profile = varietyData["flavor_profile"] as? NSDictionary

      // ─ ar-expanded-2 features ─

      if harvestDate != nil {
        setupFreshnessRing(harvestDate: harvestDate)
      }

      if let p = profile {
        setupFlavorWheel(profile: p)
        let choc = p["pairing_chocolate"] as? String ?? ""
        let fin = p["pairing_finish"] as? String ?? ""
        if !choc.isEmpty || !fin.isEmpty {
          setupPairingCard(chocolate: choc, finish: fin, varietyName: name)
        }
      }

      let collectifNames = varietyData["collectif_member_names"] as? [String] ?? []
      if !collectifNames.isEmpty {
        setupCollectifAvatarsOverlay(names: collectifNames)
      }

      let seasonStart = varietyData["season_start"] as? String
      let seasonEnd = varietyData["season_end"] as? String
      if seasonStart != nil || seasonEnd != nil {
        setupSeasonalTimeline(start: seasonStart, end: seasonEnd, varietyName: name)
      }

      if let distKm = varietyData["farm_distance_km"] as? NSNumber, distKm.doubleValue > 0 {
        setupFarmArc(distanceKm: CGFloat(distKm.doubleValue))
      }

      if (varietyData["is_first_variety"] as? NSNumber)?.boolValue == true {
        setupPassportStamp(varietyName: name)
      }

      if let drop = varietyData["active_drop"] as? NSDictionary {
        let dropTitle = (drop["title"] as? String) ?? "This variety"
        let priceCents = (drop["price_cents"] as? NSNumber)?.intValue ?? 0
        setupDropAlertOverlay(title: dropTitle, priceCents: priceCents)
      }

      // ─ ar-expanded-3 features ─

      // Brix score — upper-left mirror of freshness ring
      if let brix = (varietyData["brix_score"] as? NSNumber)?.doubleValue {
        setupBrixScore(brixScore: brix)
      }

      // Growing method badge — right side
      let growingMethod = varietyData["growing_method"] as? String
      if growingMethod != nil {
        setupGrowingMethodBadge(
          growingMethod: growingMethod,
          moonPhase: varietyData["moon_phase_at_harvest"] as? String
        )
      }

      // Lineage tree — above flavor wheel
      let parentA = varietyData["parent_a"] as? String
      let parentB = varietyData["parent_b"] as? String
      if parentA != nil || parentB != nil {
        setupLineageTree(parentA: parentA, parentB: parentB, varietyName: name)
      }

      // Altitude + soil chip — left side
      let altitudeM = (varietyData["altitude_m"] as? NSNumber)?.intValue
      let soilType = varietyData["soil_type"] as? String
      if altitudeM != nil || soilType != nil {
        setupAltitudeSoilChip(altitudeM: altitudeM, soilType: soilType)
      }

      // Optimal eating window — below altitude chip
      let eatByDays = (varietyData["eat_by_days"] as? NSNumber)?.intValue
      if harvestDate != nil || eatByDays != nil {
        setupOptimalEating(harvestDate: harvestDate, eatByDays: eatByDays)
      }

      // Recipe card — below seasonal timeline
      let recipeName = varietyData["recipe_name"] as? String
      if recipeName != nil {
        setupRecipeCard(
          recipeName: recipeName,
          recipeDescription: varietyData["recipe_description"] as? String
        )
      }

      // Weather at harvest — upper area
      let weatherJson = varietyData["harvest_weather_json"] as? String
      if weatherJson != nil {
        setupWeatherAtHarvest(harvestWeatherJson: weatherJson)
      }

      // Farm photo — screen-space right panel
      let farmPhotoUrl = varietyData["farm_photo_url"] as? String
      if let url = farmPhotoUrl, !url.isEmpty {
        setupFarmPhotoOverlay(photoUrl: url, farmName: farm)
      }

      // Producer video — screen-space, below farm photo
      let producerVideoUrl = varietyData["producer_video_url"] as? String
      if let url = producerVideoUrl, !url.isEmpty {
        let farmPhotoPresent = !(farmPhotoUrl ?? "").isEmpty
        setupProducerVideoOverlay(videoUrl: url, farmName: farm, belowPhoto: farmPhotoPresent)
      }

      // Variety map — bottom-left overlay
      if let scannedRaw = varietyData["scanned_varieties"] as? [[String: Any]] {
        let varieties = scannedRaw.compactMap { d -> ARVarietyMapView.MapVariety? in
          guard let vid = (d["variety_id"] as? NSNumber)?.intValue else { return nil }
          return ARVarietyMapView.MapVariety(
            varietyId: vid,
            varietyName: d["variety_name"] as? String ?? "",
            lat: (d["farm_lat"] as? NSNumber)?.doubleValue,
            lng: (d["farm_lng"] as? NSNumber)?.doubleValue
          )
        }
        if !varieties.isEmpty { setupVarietyMapOverlay(varieties: varieties) }
      }

      // Streak flame — top-right, offset below drop alert if present
      let streakWeeks = (varietyData["streak_weeks"] as? NSNumber)?.intValue ?? 0
      if streakWeeks >= 2 {
        let hasDropAlert = varietyData["active_drop"] != nil
        setupStreakFlameOverlay(streakWeeks: streakWeeks, topOffset: hasDropAlert ? 100 : 16)
      }

      // Collectif rank — SCNPlane upper-left of scene
      let collectifRank = (varietyData["collectif_rank"] as? NSNumber)?.intValue
      let collectifTotal = (varietyData["collectif_total_members"] as? NSNumber)?.intValue
      if let rank = collectifRank, let total = collectifTotal {
        setupCollectifRankCard(rank: rank, totalMembers: total)
      }

      // Share button
      setupShareButton()
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

  // MARK: - Scene

  private func setupSceneView() {
    sceneView.frame = view.bounds
    sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    sceneView.delegate = self
    sceneView.showsStatistics = false
    view.addSubview(sceneView)
  }

  // MARK: - ar-expanded-2 setups

  private func setupFreshnessRing(harvestDate: String?) {
    let size = CGSize(width: 110, height: 130)
    let v = ARFreshnessRingView(harvestDateISO: harvestDate)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.09, 0.105))
    node.position = SCNVector3(0.22, 0.14, -0.55)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupFlavorWheel(profile: NSDictionary) {
    let s = CGFloat((profile["sweetness"] as? NSNumber)?.doubleValue ?? 5)
    let a = CGFloat((profile["acidity"] as? NSNumber)?.doubleValue ?? 5)
    let ar = CGFloat((profile["aroma"] as? NSNumber)?.doubleValue ?? 5)
    let t = CGFloat((profile["texture"] as? NSNumber)?.doubleValue ?? 5)
    let i = CGFloat((profile["intensity"] as? NSNumber)?.doubleValue ?? 5)
    let pairing: String? = {
      let choc = profile["pairing_chocolate"] as? String ?? ""
      let fin = profile["pairing_finish"] as? String ?? ""
      let parts = [choc, fin].filter { !$0.isEmpty }
      return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }()
    let size = CGSize(width: 360, height: 220)
    let v = ARFlavorWheelView(sweetness: s, acidity: a, aroma: ar, texture: t, intensity: i, pairingText: pairing)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.28, 0.17))
    node.position = SCNVector3(0.0, 0.24, -0.60)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupPairingCard(chocolate: String, finish: String, varietyName: String) {
    let size = CGSize(width: 240, height: 120)
    let v = ARPairingCardView(chocolate: chocolate, finish: finish, varietyName: varietyName)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.19, 0.095))
    node.position = SCNVector3(0.0, -0.17, -0.55)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupCollectifAvatarsOverlay(names: [String]) {
    let v = ARCollectifAvatarsView(names: names)
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
      v.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -80),
    ])
  }

  private func setupSeasonalTimeline(start: String?, end: String?, varietyName: String) {
    let size = CGSize(width: 420, height: 80)
    let v = ARSeasonalTimelineView(seasonStart: start, seasonEnd: end, varietyName: varietyName)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.32, 0.062))
    node.position = SCNVector3(0.0, -0.27, -0.58)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupFarmArc(distanceKm: CGFloat) {
    let steps = 12
    let arcHeight: Float = 0.12
    let startZ: Float = -0.50
    let endZ: Float = -0.80
    for i in 0...steps {
      let t = Float(i) / Float(steps)
      let sphere = SCNSphere(radius: i == 0 || i == steps ? 0.004 : 0.002)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: CGFloat(1 - t * 0.5))
      sphere.materials = [mat]
      let node = SCNNode(geometry: sphere)
      node.position = SCNVector3(0, arcHeight * sin(Float.pi * t), startZ + (endZ - startZ) * t)
      sceneView.scene.rootNode.addChildNode(node)
    }
    let text = SCNText(string: "\(Int(distanceKm)) km from farm", extrusionDepth: 0.001)
    text.font = UIFont.monospacedSystemFont(ofSize: 4, weight: .medium)
    text.firstMaterial?.diffuse.contents = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 0.9)
    let textNode = SCNNode(geometry: text)
    textNode.position = SCNVector3(-0.05, arcHeight + 0.015, (startZ + endZ) / 2)
    textNode.scale = SCNVector3(0.004, 0.004, 0.004)
    let bb = SCNBillboardConstraint(); bb.freeAxes = .all
    textNode.constraints = [bb]
    sceneView.scene.rootNode.addChildNode(textNode)
  }

  private func setupPassportStamp(varietyName: String) {
    let stamp = ARPassportStampView(varietyName: varietyName)
    stamp.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stamp)
    NSLayoutConstraint.activate([
      stamp.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      stamp.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      stamp.widthAnchor.constraint(equalToConstant: 220),
      stamp.heightAnchor.constraint(equalToConstant: 220),
    ])
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { stamp.animateAndRemove() }
  }

  private func setupDropAlertOverlay(title: String, priceCents: Int) {
    let v = ARDropAlertView(dropTitle: title, priceCents: priceCents) { [weak self] in
      self?.handleDismiss()
      self?.onDropAlertTap?()
    }
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
      v.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      v.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
    ])
    v.animateIn()
  }

  // MARK: - ar-expanded-3 setups

  private func setupBrixScore(brixScore: Double) {
    let size = CGSize(width: 280, height: 120)
    let v = ARBrixScoreView(brixScore: brixScore)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.22, 0.095))
    node.position = SCNVector3(-0.24, 0.14, -0.55)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupGrowingMethodBadge(growingMethod: String?, moonPhase: String?) {
    let size = CGSize(width: 140, height: 140)
    let v = ARGrowingMethodBadge(growingMethod: growingMethod, moonPhase: moonPhase)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.10, 0.10))
    node.position = SCNVector3(0.26, -0.06, -0.55)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupLineageTree(parentA: String?, parentB: String?, varietyName: String) {
    let size = CGSize(width: 300, height: 110)
    let v = ARLineageTreeView(parentA: parentA, parentB: parentB, varietyName: varietyName)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.24, 0.088))
    node.position = SCNVector3(0.0, 0.36, -0.65)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupAltitudeSoilChip(altitudeM: Int?, soilType: String?) {
    let size = CGSize(width: 220, height: 80)
    let v = ARAltitudeSoilChipView(altitudeM: altitudeM, soilType: soilType)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.175, 0.064))
    node.position = SCNVector3(-0.25, 0.02, -0.55)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupOptimalEating(harvestDate: String?, eatByDays: Int?) {
    let size = CGSize(width: 260, height: 90)
    let v = AROptimalEatingView(harvestDate: harvestDate, eatByDays: eatByDays)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.205, 0.071))
    node.position = SCNVector3(-0.25, -0.10, -0.55)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupRecipeCard(recipeName: String?, recipeDescription: String?) {
    let size = CGSize(width: 300, height: 120)
    let v = ARRecipeCardView(recipeName: recipeName, recipeDescription: recipeDescription)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.24, 0.096))
    node.position = SCNVector3(0.0, -0.39, -0.62)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupWeatherAtHarvest(harvestWeatherJson: String?) {
    let size = CGSize(width: 280, height: 100)
    let v = ARWeatherAtHarvestView(harvestWeatherJson: harvestWeatherJson)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.22, 0.079))
    node.position = SCNVector3(0.0, 0.46, -0.68)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupCollectifRankCard(rank: Int, totalMembers: Int) {
    let size = CGSize(width: 180, height: 140)
    let v = ARCollectifRankView(rank: rank, totalMembers: totalMembers)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.14, 0.11))
    node.position = SCNVector3(-0.27, 0.30, -0.62)
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Screen-space overlays

  private func setupFarmPhotoOverlay(photoUrl: String, farmName: String) {
    let v = ARFarmPhotoView(photoUrl: photoUrl, farmName: farmName)
    v.frame = CGRect(x: 0, y: 0, width: 120, height: 150)
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
      v.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -30),
      v.widthAnchor.constraint(equalToConstant: 120),
      v.heightAnchor.constraint(equalToConstant: 150),
    ])
  }

  private func setupProducerVideoOverlay(videoUrl: String, farmName: String, belowPhoto: Bool) {
    let v = ARProducerVideoView(producerName: farmName, thumbnailUrl: nil)
    v.translatesAutoresizingMaskIntoConstraints = false
    v.onPlay = {
      if let url = URL(string: videoUrl) {
        UIApplication.shared.open(url)
      }
    }
    view.addSubview(v)
    let topOffset: CGFloat = belowPhoto ? 135 : 0
    NSLayoutConstraint.activate([
      v.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
      v.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: topOffset + 60),
      v.widthAnchor.constraint(equalToConstant: 120),
      v.heightAnchor.constraint(equalToConstant: 90),
    ])
  }

  private func setupVarietyMapOverlay(varieties: [ARVarietyMapView.MapVariety]) {
    let v = ARVarietyMapView()
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12),
      v.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -80),
      v.widthAnchor.constraint(equalToConstant: 160),
      v.heightAnchor.constraint(equalToConstant: 130),
    ])
    v.configure(varieties: varieties)
  }

  private func setupStreakFlameOverlay(streakWeeks: Int, topOffset: CGFloat) {
    let v = ARStreakFlameView(streakWeeks: streakWeeks)
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
      v.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: topOffset),
      v.widthAnchor.constraint(equalToConstant: 80),
      v.heightAnchor.constraint(equalToConstant: 110),
    ])
    v.startAnimating()
  }

  private func setupOrderRoutingGrid(slots: [AROrderRoutingGrid.PickupSlot]) {
    let v = AROrderRoutingGrid()
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12),
      v.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -80),
      v.widthAnchor.constraint(equalToConstant: 180),
    ])
    v.configure(slots: slots)
  }

  private func setupShareButton() {
    let btn = UIButton(type: .system)
    btn.setTitle("Share", for: .normal)
    btn.titleLabel?.font = UIFont.monospacedSystemFont(ofSize: 14, weight: .medium)
    btn.setTitleColor(UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1), for: .normal)
    btn.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    btn.layer.cornerRadius = 18
    btn.contentEdgeInsets = UIEdgeInsets(top: 8, left: 20, bottom: 8, right: 20)
    btn.translatesAutoresizingMaskIntoConstraints = false
    btn.addTarget(self, action: #selector(handleShare), for: .touchUpInside)
    view.addSubview(btn)
    NSLayoutConstraint.activate([
      btn.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
      btn.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
    ])
  }

  @objc private func handleShare() {
    let name = (varietyData["variety_name"] as? String) ?? "Strawberry"
    let farm = (varietyData["farm"] as? String) ?? ""
    let harvestDate = varietyData["harvest_date"] as? String
    let seasonStart = varietyData["season_start"] as? String
    let seasonEnd = varietyData["season_end"] as? String

    let shareView = ARSocialShareView(
      varietyName: name,
      farmName: farm,
      harvestDate: harvestDate,
      seasonStart: seasonStart,
      seasonEnd: seasonEnd
    )
    let image = shareView.renderToImage()
    let vc = UIActivityViewController(activityItems: [image], applicationActivities: nil)
    vc.excludedActivityTypes = [.addToReadingList, .assignToContact]
    present(vc, animated: true)
  }

  // MARK: - Batch scan

  func addBatchOrder(id: Int, variety: String, qty: Int) {
    batchOverlay?.addOrder(id: id, variety: variety, qty: qty)
  }

  // MARK: - Helpers

  private func makePlaneNode(view: UIView, size: CGSize, scnSize: (CGFloat, CGFloat)) -> SCNNode {
    let image = renderView(view, size: size)
    let plane = SCNPlane(width: scnSize.0, height: scnSize.1)
    plane.materials = [makeMaterial(image: image)]
    let node = SCNNode(geometry: plane)
    node.constraints = [makeBillboard()]
    return node
  }

  private func renderView(_ view: UIView, size: CGSize) -> UIImage {
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { ctx in view.layer.render(in: ctx.cgContext) }
  }

  private func makeMaterial(image: UIImage) -> SCNMaterial {
    let mat = SCNMaterial()
    mat.diffuse.contents = image
    mat.isDoubleSided = true
    return mat
  }

  private func makeBillboard() -> SCNBillboardConstraint {
    let b = SCNBillboardConstraint()
    b.freeAxes = .Y
    return b
  }

  // MARK: - Card setups

  private func setupCard() {
    if marketStallMode { setupMarketStallCard(); return }
    if staffMode, let sd = staffData { setupStaffCard(staffData: sd); return }
    if batchScanMode { return }

    let name = (varietyData["variety_name"] as? String) ?? "Strawberry"
    let farm = (varietyData["farm"] as? String) ?? ""
    let harvestDate = (varietyData["harvest_date"] as? String) ?? ""
    let quantity = (varietyData["quantity"] as? NSNumber)?.intValue ?? 0
    let chocolate = (varietyData["chocolate"] as? String) ?? ""
    let finish = (varietyData["finish"] as? String) ?? ""
    let vitaminCMg = varietyData["vitamin_c_today_mg"] as? NSNumber
    let caloriesTodayKcal = varietyData["calories_today_kcal"] as? NSNumber
    let collectifPickupsToday = varietyData["collectif_pickups_today"] as? NSNumber
    let collectifMemberNamesRaw = varietyData["collectif_member_names"] as? [String] ?? []
    let orderCount = varietyData["order_count"] as? NSNumber
    let cardType = (varietyData["card_type"] as? String) ?? "variety"
    let vendorDescription = varietyData["vendor_description"] as? String
    let vendorTagsRaw: String?
    if let tagsArray = varietyData["vendor_tags"] as? [String] {
      vendorTagsRaw = tagsArray.joined(separator: ",")
    } else {
      vendorTagsRaw = varietyData["vendor_tags"] as? String
    }

    isGift = (varietyData["is_gift"] as? NSNumber)?.boolValue ?? false
    giftNote = (varietyData["gift_note"] as? String) ?? ""
    let standingOrderLabel = varietyData["next_standing_order_label"] as? String

    let cardView = ARCardView(
      name: name, farm: farm, harvestDate: harvestDate, quantity: quantity,
      chocolate: chocolate, finish: finish, vitaminCMg: vitaminCMg,
      caloriesTodayKcal: caloriesTodayKcal, collectifPickupsToday: collectifPickupsToday,
      collectifMemberNames: collectifMemberNamesRaw, orderCount: orderCount,
      cardType: cardType, vendorDescription: vendorDescription,
      vendorTags: vendorTagsRaw, standingOrderLabel: standingOrderLabel
    )
    cardView.frame = CGRect(x: 0, y: 0, width: 480, height: 320)
    cardView.layoutIfNeeded()
    let cardImage = renderView(cardView, size: CGSize(width: 480, height: 320))

    let plane = SCNPlane(width: 0.30, height: 0.20)
    plane.materials = [makeMaterial(image: cardImage)]
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0, 0, -0.55)
    node.constraints = [makeBillboard()]
    if isGift && !giftNote.isEmpty { node.opacity = 0 }
    cardNode = node
    sceneView.scene.rootNode.addChildNode(node)

    if let lastVariety = varietyData["last_variety"] as? NSDictionary {
      setupLastVarietyCard(lastVariety: lastVariety)
    }
  }

  private func setupLastVarietyCard(lastVariety: NSDictionary) {
    let lastName = (lastVariety["name"] as? String) ?? ""
    let lastFarm = (lastVariety["farm"] as? String) ?? ""
    let lastHarvest = (lastVariety["harvest_date"] as? String) ?? ""
    guard !lastName.isEmpty else { return }

    let lastCardView = ARCardView(
      name: lastName, farm: lastFarm, harvestDate: lastHarvest, quantity: 0,
      chocolate: "", finish: "", vitaminCMg: nil, caloriesTodayKcal: nil,
      collectifPickupsToday: nil, collectifMemberNames: [], orderCount: nil,
      cardType: "variety", vendorDescription: nil, vendorTags: nil, standingOrderLabel: nil
    )
    lastCardView.frame = CGRect(x: 0, y: 0, width: 480, height: 320)
    lastCardView.layoutIfNeeded()
    let cardImage = renderView(lastCardView, size: CGSize(width: 480, height: 320))

    let plane = SCNPlane(width: 0.30, height: 0.20)
    let mat = SCNMaterial()
    mat.diffuse.contents = cardImage
    mat.diffuse.intensity = 0.55
    mat.isDoubleSided = true
    plane.materials = [mat]

    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(-0.22, 0.05, -0.65)
    node.opacity = 0.55
    node.constraints = [makeBillboard()]

    let lastTimeText = SCNText(string: "LAST TIME", extrusionDepth: 0.001)
    lastTimeText.font = UIFont.monospacedSystemFont(ofSize: 4, weight: .medium)
    lastTimeText.firstMaterial?.diffuse.contents = UIColor.white.withAlphaComponent(0.7)
    let labelNode = SCNNode(geometry: lastTimeText)
    labelNode.position = SCNVector3(-0.22, 0.17, -0.65)
    labelNode.scale = SCNVector3(0.004, 0.004, 0.004)

    sceneView.scene.rootNode.addChildNode(node)
    sceneView.scene.rootNode.addChildNode(labelNode)
  }

  private func setupStaffCard(staffData: NSDictionary) {
    let varietyName = (staffData["variety_name"] as? String) ?? "Order"
    let status = (staffData["status"] as? String) ?? ""
    let quantity = (staffData["quantity"] as? NSNumber)?.intValue ?? 0

    let cardView = UIView()
    cardView.backgroundColor = UIColor(red: 0.969, green: 0.961, blue: 0.949, alpha: 0.94)
    cardView.layer.cornerRadius = 20
    cardView.layer.masksToBounds = true
    cardView.frame = CGRect(x: 0, y: 0, width: 480, height: 240)

    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 12
    stack.layoutMargins = UIEdgeInsets(top: 20, left: 24, bottom: 20, right: 24)
    stack.isLayoutMarginsRelativeArrangement = true
    stack.translatesAutoresizingMaskIntoConstraints = false
    cardView.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: cardView.topAnchor),
      stack.leadingAnchor.constraint(equalTo: cardView.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: cardView.trailingAnchor),
      stack.bottomAnchor.constraint(equalTo: cardView.bottomAnchor),
    ])

    let nameLabel = UILabel()
    nameLabel.text = varietyName.uppercased()
    nameLabel.font = UIFont.monospacedSystemFont(ofSize: 22, weight: .semibold)
    nameLabel.textColor = UIColor(red: 0.13, green: 0.12, blue: 0.11, alpha: 1)
    stack.addArrangedSubview(nameLabel)

    let qtyLabel = UILabel()
    qtyLabel.text = "QTY \(quantity)"
    qtyLabel.font = UIFont.monospacedSystemFont(ofSize: 14, weight: .regular)
    qtyLabel.textColor = UIColor(red: 0.5, green: 0.47, blue: 0.44, alpha: 1)
    stack.addArrangedSubview(qtyLabel)

    let statusPillColor: UIColor
    switch status {
    case "paid": statusPillColor = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    case "preparing": statusPillColor = UIColor(red: 0.22, green: 0.75, blue: 0.35, alpha: 1)
    case "ready": statusPillColor = UIColor(red: 0.063, green: 0.725, blue: 0.506, alpha: 1)
    default: statusPillColor = UIColor.gray
    }
    let pill = UIView()
    pill.backgroundColor = statusPillColor
    pill.layer.cornerRadius = 12
    let pillLabel = UILabel()
    pillLabel.text = status.uppercased()
    pillLabel.font = UIFont.monospacedSystemFont(ofSize: 13, weight: .medium)
    pillLabel.textColor = .white
    pillLabel.textAlignment = .center
    pillLabel.translatesAutoresizingMaskIntoConstraints = false
    pill.addSubview(pillLabel)
    pill.heightAnchor.constraint(equalToConstant: 44).isActive = true
    NSLayoutConstraint.activate([
      pillLabel.centerXAnchor.constraint(equalTo: pill.centerXAnchor),
      pillLabel.centerYAnchor.constraint(equalTo: pill.centerYAnchor),
    ])
    stack.addArrangedSubview(pill)

    cardView.layoutIfNeeded()
    let cardImage = renderView(cardView, size: CGSize(width: 480, height: 240))
    let plane = SCNPlane(width: 0.30, height: 0.15)
    plane.materials = [makeMaterial(image: cardImage)]
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0, 0, -0.55)
    node.constraints = [makeBillboard()]
    cardNode = node
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupMarketStallCard() {
    let stallCardView = ARMarketStallCardView(stallData: varietyData)
    stallCardView.frame = CGRect(x: 0, y: 0, width: 480, height: 360)
    stallCardView.layoutIfNeeded()
    let cardImage = renderView(stallCardView, size: CGSize(width: 480, height: 360))
    let plane = SCNPlane(width: 0.30, height: 0.225)
    plane.materials = [makeMaterial(image: cardImage)]
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0, 0, -0.55)
    node.constraints = [makeBillboard()]
    cardNode = node
    sceneView.scene.rootNode.addChildNode(node)
  }

  // MARK: - Gift reveal

  private func setupGiftCard() {
    let giftView = ARGiftCardView(note: giftNote)
    giftView.frame = CGRect(x: 0, y: 0, width: 480, height: 280)
    giftView.layoutIfNeeded()
    let giftImage = renderView(giftView, size: CGSize(width: 480, height: 280))
    let plane = SCNPlane(width: 0.30, height: 0.175)
    plane.materials = [makeMaterial(image: giftImage)]
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0, 0, -0.55)
    node.constraints = [makeBillboard()]
    giftCardNode = node
    sceneView.scene.rootNode.addChildNode(node)
  }

  @objc private func handleSceneTap() {
    guard !hasRevealedGift else { return }
    hasRevealedGift = true
    SCNTransaction.begin()
    SCNTransaction.animationDuration = 0.4
    giftCardNode?.opacity = 0
    cardNode?.opacity = 1
    SCNTransaction.commit()
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
      self?.giftCardNode?.removeFromParentNode()
    }
  }

  // MARK: - UI

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
    let interval: TimeInterval = (marketStallMode || batchScanMode) ? 120 : 30
    dismissTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
      self?.handleDismiss()
    }
  }

  @objc private func handleDismiss() {
    dismissTimer?.invalidate()
    // Show tasting journal for user (non-staff, non-market, non-batch) mode
    if !staffMode && !marketStallMode && !batchScanMode && onTastingRating != nil {
      let varietyName = (varietyData["variety_name"] as? String) ?? "Strawberry"
      let journal = ARTastingJournalOverlay(varietyName: varietyName)
      journal.translatesAutoresizingMaskIntoConstraints = false
      journal.onSave = { [weak self] rating, notes in
        self?.onTastingRating?(rating, notes)
        self?.commitDismiss()
      }
      journal.onSkip = { [weak self] in self?.commitDismiss() }
      view.addSubview(journal)
      NSLayoutConstraint.activate([
        journal.topAnchor.constraint(equalTo: view.topAnchor),
        journal.leadingAnchor.constraint(equalTo: view.leadingAnchor),
        journal.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        journal.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      ])
      journal.animateIn()
    } else {
      commitDismiss()
    }
  }

  private func commitDismiss() {
    dismiss(animated: true) { [weak self] in
      self?.onDismiss()
    }
  }

  @objc private func appDidBackground() {
    sceneView.session.pause()
  }
}
