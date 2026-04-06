import UIKit
import ARKit
import SceneKit
import CoreMotion

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

  // AR Expanded 4: new callbacks
  var onFarmVisitTap: (() -> Void)?
  var onLeaveNote: ((String, String) -> Void)?
  var onQuantityConfirm: ((Int) -> Void)?

  // AR Expanded 5-6: new callbacks
  var onGiftRegistryAdd: (() -> Void)?
  var onReferralTap: (() -> Void)?
  var onBundleTap: (() -> Void)?

  // AR Expanded 5-6: CoreMotion
  private var motionManager: CMMotionManager?

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

      // ─ ar-expanded-4 features ─

      // Unboxing animation (first-time variety)
      if (varietyData["is_first_variety"] as? NSNumber)?.boolValue == true {
        ARUnboxingAnimator.animate(in: sceneView.scene)
      }

      // Nutrition rings (when HealthKit data present)
      let vitaminC = (varietyData["vitamin_c_today_mg"] as? NSNumber)?.doubleValue ?? 0
      let fiber = (varietyData["fiber_today_g"] as? NSNumber)?.doubleValue ?? 0
      let calories = (varietyData["calories_today_kcal"] as? NSNumber)?.doubleValue ?? 0
      if vitaminC > 0 || calories > 0 {
        setupNutritionRings(vitaminC: vitaminC, fiber: fiber, calories: calories)
      }

      // Allergy flag (brief banner if allergens present)
      let allergens = varietyData["allergy_flags"] as? [String] ?? []
      if !allergens.isEmpty {
        setupAllergyFlag(allergens: allergens)
      }

      // Achievement badges
      let achievements = varietyData["unlocked_achievements"] as? [String] ?? []
      if !achievements.isEmpty {
        setupAchievementBadges(achievementIds: achievements)
      }

      // Collectif milestone confetti
      let milestonePct = (varietyData["collectif_milestone_pct"] as? NSNumber)?.intValue ?? 0
      if milestonePct >= 50 {
        setupMilestoneConfetti(pct: milestonePct)
      }

      // Price history sparkline
      let priceHistoryJson = varietyData["price_history_json"] as? String
      if priceHistoryJson != nil {
        setupPriceHistory(json: priceHistoryJson)
      }

      // Carbon footprint card
      if let co2 = (varietyData["co2_grams"] as? NSNumber)?.intValue {
        setupCarbonFootprint(
          co2Grams: co2,
          offsetProgram: varietyData["carbon_offset_program"] as? String
        )
      }

      // Sunlight hours bar
      if let sun = (varietyData["sunlight_hours"] as? NSNumber)?.doubleValue {
        setupSunlightHours(hours: sun)
      }

      // Farm visit CTA
      if let visitData = varietyData["open_farm_visit"] as? NSDictionary {
        let visitDate = (visitData["visit_date"] as? String) ?? ""
        let spotsLeft = (visitData["spots_left"] as? NSNumber)?.intValue ?? 0
        setupFarmVisitCTA(visitDate: visitDate, spotsLeft: spotsLeft)
      }

      // Sticky notes nearby
      if let notesRaw = varietyData["nearby_ar_notes"] as? [[String: Any]], !notesRaw.isEmpty {
        setupStickyNotes(notesRaw: notesRaw)
      }

      // "Leave a note" button (always in user mode)
      setupLeaveNoteButton()

      // Constellation button
      setupConstellationButton()
    }

    // ─ ar-expanded-5-6 features ─
    if !staffMode {
      setupFlavorMemory()
      setupMicronutrients()
      setupSugarAcidDial()
      setupAntioxidantShield()
      setupFermentationCard()
      setupPigmentSpectrum()
      setupFarmerPortrait()
      setupFarmCertWall()
      setupFarmFounding()
      setupIrrigationDiagram()
      setupCoverCrop()
      setupMicroclimate()
      setupBundleSuggestion()
      setupEarlyAccessCountdown()
      setupPriceDropBadge()
      setupReferralBubble()
      setupGiftRegistry()
      setupWordCloud()
      setupWhoElseGotThis()
      setupMemoryLane()
      setupChallengeQuest()
      setupCoScanButton()
      setupStreakLeaderboard()
      setupAmbientAudio()
      setupShakeToShuffle()
      setupMascot()
    }
    if staffMode {
      setupOrderExpiryGrid()
      setupStaffPerformance()
      setupPostalHeatMap()
    }

    // Staff: quantity counter
    if staffMode && !batchScanMode, let sd = staffData {
      let qty = (sd["quantity"] as? NSNumber)?.intValue ?? 0
      if qty > 0 { setupQuantityCounter(expectedQty: qty) }
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
    motionManager?.stopAccelerometerUpdates()
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

  // MARK: - ar-expanded-4 setups

  private func setupNutritionRings(vitaminC: Double, fiber: Double, calories: Double) {
    let size = CGSize(width: 260, height: 260)
    let v = ARNutritionRingsView(vitaminCMg: vitaminC, fiberG: fiber, caloriesKcal: calories)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.18, 0.18))
    node.position = SCNVector3(0.28, -0.20, -0.60)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupAllergyFlag(allergens: [String]) {
    let v = ARAllergyFlagView(allergens: allergens)
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 60),
      v.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      v.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
      v.heightAnchor.constraint(equalToConstant: 52),
    ])
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { v.animateInAndRemove() }
  }

  private func setupAchievementBadges(achievementIds: [String]) {
    let badge = ARAchievementBadgeView(achievementIds: achievementIds)
    badge.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(badge)
    NSLayoutConstraint.activate([
      badge.centerXAnchor.constraint(equalTo: view.centerXAnchor, constant: 80),
      badge.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      badge.widthAnchor.constraint(equalToConstant: 140),
      badge.heightAnchor.constraint(equalToConstant: 140),
    ])
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { badge.animateAndRemove() }
  }

  private func setupMilestoneConfetti(pct: Int) {
    let system = SCNParticleSystem()
    system.particleColor = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    system.particleColorVariation = SCNVector4(0.3, 0.3, 0.0, 0.0)
    system.emissionDuration = 1.5
    system.birthRate = 120
    system.particleLifeSpan = 3.0
    system.particleVelocity = 0.4
    system.particleVelocityVariation = 0.2
    system.spreadingAngle = 60
    system.particleSize = 0.004
    system.particleSizeVariation = 0.002
    system.acceleration = SCNVector3(0, -0.15, 0)
    system.isAffectedByGravity = true
    let emitter = SCNNode()
    emitter.position = SCNVector3(0, 0.30, -0.55)
    emitter.addParticleSystem(system)
    sceneView.scene.rootNode.addChildNode(emitter)
    DispatchQueue.main.asyncAfter(deadline: .now() + 4.0) { emitter.removeFromParentNode() }
  }

  private func setupPriceHistory(json: String?) {
    let history = ARPriceHistoryView.parsePriceHistory(from: json)
    guard !history.isEmpty else { return }
    let size = CGSize(width: 300, height: 110)
    let v = ARPriceHistoryView(priceHistory: history)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.24, 0.088))
    node.position = SCNVector3(0.0, -0.50, -0.65)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupCarbonFootprint(co2Grams: Int, offsetProgram: String?) {
    let size = CGSize(width: 280, height: 110)
    let v = ARCarbonFootprintView(co2Grams: co2Grams, offsetProgram: offsetProgram)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.22, 0.087))
    node.position = SCNVector3(-0.28, -0.22, -0.62)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupSunlightHours(hours: Double) {
    let size = CGSize(width: 260, height: 80)
    let v = ARSunlightHoursView(sunlightHours: hours)
    v.frame = CGRect(origin: .zero, size: size)
    v.layoutIfNeeded()
    let node = makePlaneNode(view: v, size: size, scnSize: (0.205, 0.063))
    node.position = SCNVector3(0.28, 0.06, -0.60)
    sceneView.scene.rootNode.addChildNode(node)
  }

  private func setupFarmVisitCTA(visitDate: String, spotsLeft: Int) {
    let v = ARFarmVisitCTAView(visitDate: visitDate, spotsLeft: spotsLeft)
    v.translatesAutoresizingMaskIntoConstraints = false
    v.onTap = { [weak self] in
      self?.handleDismiss()
      self?.onFarmVisitTap?()
    }
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      v.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
      v.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -70),
      v.heightAnchor.constraint(equalToConstant: 64),
    ])
    v.animateIn()
  }

  private func setupStickyNotes(notesRaw: [[String: Any]]) {
    for (i, d) in notesRaw.prefix(5).enumerated() {
      guard let body = d["body"] as? String else { continue }
      let author = d["author_name"] as? String ?? "?"
      let color = d["color"] as? String ?? "amber"
      let createdAtStr = d["created_at"] as? String ?? ""
      let date = ISO8601DateFormatter().date(from: createdAtStr) ?? Date()
      let size = CGSize(width: 220, height: 160)
      let v = ARStickyNoteView(body: body, authorName: author, color: color, createdAt: date)
      v.frame = CGRect(origin: .zero, size: size)
      v.layoutIfNeeded()
      let xOffset = Float(i % 3) * 0.22 - 0.22
      let yOffset = Float(i / 3) * 0.20 + 0.45
      let node = makePlaneNode(view: v, size: size, scnSize: (0.16, 0.115))
      node.position = SCNVector3(xOffset, yOffset, -0.70)
      let bb = SCNBillboardConstraint(); bb.freeAxes = .all
      node.constraints = [bb]
      sceneView.scene.rootNode.addChildNode(node)
    }
  }

  private func setupLeaveNoteButton() {
    let btn = UIButton(type: .system)
    btn.setTitle("📌 Note", for: .normal)
    btn.titleLabel?.font = UIFont.monospacedSystemFont(ofSize: 13, weight: .medium)
    btn.setTitleColor(UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1), for: .normal)
    btn.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    btn.layer.cornerRadius = 18
    btn.contentEdgeInsets = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
    btn.translatesAutoresizingMaskIntoConstraints = false
    btn.addTarget(self, action: #selector(handleLeaveNote), for: .touchUpInside)
    view.addSubview(btn)
    NSLayoutConstraint.activate([
      btn.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
      btn.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
    ])
  }

  @objc private func handleLeaveNote() {
    let composer = ARStickyNoteComposer()
    composer.translatesAutoresizingMaskIntoConstraints = false
    composer.onPost = { [weak self] body, color in
      self?.onLeaveNote?(body, color)
      composer.removeFromSuperview()
    }
    composer.onCancel = { composer.removeFromSuperview() }
    view.addSubview(composer)
    NSLayoutConstraint.activate([
      composer.topAnchor.constraint(equalTo: view.topAnchor),
      composer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      composer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      composer.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    composer.animateIn()
  }

  private func setupConstellationButton() {
    let btn = UIButton(type: .system)
    btn.setTitle("✦", for: .normal)
    btn.titleLabel?.font = UIFont.systemFont(ofSize: 20)
    btn.setTitleColor(UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1), for: .normal)
    btn.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    btn.layer.cornerRadius = 22
    btn.translatesAutoresizingMaskIntoConstraints = false
    btn.addTarget(self, action: #selector(handleConstellation), for: .touchUpInside)
    view.addSubview(btn)
    NSLayoutConstraint.activate([
      btn.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
      btn.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
      btn.widthAnchor.constraint(equalToConstant: 44),
      btn.heightAnchor.constraint(equalToConstant: 44),
    ])
  }

  @objc private func handleConstellation() {
    guard let starsRaw = varietyData["scanned_varieties"] as? [[String: Any]] else { return }
    let currentName = (varietyData["variety_name"] as? String) ?? ""
    let stars = starsRaw.compactMap { d -> ARConstellationViewController.ConstellationStar? in
      guard let name = d["variety_name"] as? String else { return nil }
      let count = (d["order_count"] as? NSNumber)?.intValue ?? 1
      return ARConstellationViewController.ConstellationStar(
        varietyName: name,
        orderCount: count,
        isCurrentVariety: name == currentName
      )
    }
    guard !stars.isEmpty else { return }
    let vc = ARConstellationViewController(stars: stars, currentVarietyName: currentName)
    vc.modalPresentationStyle = .fullScreen
    present(vc, animated: true)
  }

  private func setupQuantityCounter(expectedQty: Int) {
    let overlay = ARQuantityCounterOverlay(expectedQty: expectedQty)
    overlay.translatesAutoresizingMaskIntoConstraints = false
    overlay.onConfirm = { [weak self] counted in
      self?.onQuantityConfirm?(counted)
      overlay.removeFromSuperview()
    }
    view.addSubview(overlay)
    NSLayoutConstraint.activate([
      overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      overlay.heightAnchor.constraint(equalToConstant: 200),
    ])
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
    // Feature 57: Thank-you overlay
    if let farm = varietyData["farm"] as? String, !farm.isEmpty {
      ARThankYouOverlay.present(farmName: farm, in: view)
    }
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

  // MARK: - ar-expanded-5-6 setup

  // Feature 31: Flavor memory overlay
  private func setupFlavorMemory() {
    guard
      let pb = varietyData["personal_best_flavor"] as? NSDictionary,
      let fp = varietyData["flavor_profile"] as? NSDictionary
    else { return }
    let toCurrent = ARFlavorMemoryView.FlavorProfile(
      sweetness: (fp["sweetness"] as? NSNumber)?.doubleValue ?? 5,
      acidity: (fp["acidity"] as? NSNumber)?.doubleValue ?? 5,
      aroma: (fp["aroma"] as? NSNumber)?.doubleValue ?? 5,
      texture: (fp["texture"] as? NSNumber)?.doubleValue ?? 5,
      intensity: (fp["intensity"] as? NSNumber)?.doubleValue ?? 5
    )
    let toBest = ARFlavorMemoryView.FlavorProfile(
      sweetness: (pb["sweetness"] as? NSNumber)?.doubleValue ?? 5,
      acidity: (pb["acidity"] as? NSNumber)?.doubleValue ?? 5,
      aroma: (pb["aroma"] as? NSNumber)?.doubleValue ?? 5,
      texture: (pb["texture"] as? NSNumber)?.doubleValue ?? 5,
      intensity: (pb["intensity"] as? NSNumber)?.doubleValue ?? 5
    )
    let v = ARFlavorMemoryView(current: toCurrent, personalBest: toBest)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.18, height: 0.18)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(-0.30, 0.10, -0.62)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Feature 32: Micronutrient mosaic
  private func setupMicronutrients() {
    let folate = (varietyData["folate_mcg"] as? NSNumber)?.doubleValue
    let manganese = (varietyData["manganese_mg"] as? NSNumber)?.doubleValue
    let potassium = (varietyData["potassium_mg"] as? NSNumber)?.doubleValue
    let vitaminK = (varietyData["vitamin_k_mcg"] as? NSNumber)?.doubleValue
    guard folate != nil || manganese != nil || potassium != nil || vitaminK != nil else { return }
    let v = ARMicronutrientMosaicView(folate_mcg: folate, manganese_mg: manganese, potassium_mg: potassium, vitamin_k_mcg: vitaminK)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.20, height: 0.09)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0.0, 0.30, -0.55)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Feature 33: Sugar/acid dial
  private func setupSugarAcidDial() {
    guard let brix = (varietyData["brix_score"] as? NSNumber)?.doubleValue,
          let fp = varietyData["flavor_profile"] as? NSDictionary else { return }
    let acidity = (fp["acidity"] as? NSNumber)?.doubleValue ?? 5
    let v = ARSugarAcidDialView(brix: brix, acidity: acidity)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.16, height: 0.12)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(-0.28, -0.40, -0.62)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Feature 34: Antioxidant shield (UIKit overlay — animated)
  private func setupAntioxidantShield() {
    guard let orac = (varietyData["orac_value"] as? NSNumber)?.intValue else { return }
    let v = ARAntioxidantShieldView(oracValue: orac)
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.widthAnchor.constraint(equalToConstant: 180),
      v.heightAnchor.constraint(equalToConstant: 210),
      v.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
      v.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 80),
    ])
  }

  // Feature 35: Fermentation card
  private func setupFermentationCard() {
    guard let fp = varietyData["fermentation_profile"] as? NSDictionary else { return }
    let jam = (fp["jam"] as? NSNumber)?.intValue ?? 0
    let wine = (fp["wine"] as? NSNumber)?.intValue ?? 0
    let coulis = (fp["coulis"] as? NSNumber)?.intValue ?? 0
    let vinegar = (fp["vinegar"] as? NSNumber)?.intValue ?? 0
    guard jam + wine + coulis + vinegar > 0 else { return }
    let v = ARFermentationCardView(jam: jam, wine: wine, coulis: coulis, vinegar: vinegar)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.20, height: 0.08)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0.28, -0.40, -0.62)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Feature 36: Pigment spectrum
  private func setupPigmentSpectrum() {
    guard let hue = (varietyData["hue_value"] as? NSNumber)?.intValue else { return }
    let v = ARPigmentSpectrumView(hueValue: hue)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.20, height: 0.05)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0.0, -0.60, -0.65)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Feature 37: Farmer portrait (UIKit overlay)
  private func setupFarmerPortrait() {
    guard let name = varietyData["farmer_name"] as? String, !name.isEmpty else { return }
    let quote = varietyData["farmer_quote"] as? String ?? ""
    let v = ARFarmerPortraitView(farmerName: name, quote: quote)
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.widthAnchor.constraint(equalToConstant: 240),
      v.heightAnchor.constraint(equalToConstant: 180),
      v.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      v.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -140),
    ])
  }

  // Feature 38: Farm certification wall
  private func setupFarmCertWall() {
    guard let arr = varietyData["certifications"] as? NSArray, arr.count > 0 else { return }
    let certs = arr.compactMap { $0 as? String }
    guard !certs.isEmpty else { return }
    let v = ARFarmCertWallView(certifications: certs)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.22, height: 0.07)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0.0, 0.52, -0.60)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Feature 39: Farm founding timeline
  private func setupFarmFounding() {
    guard let year = (varietyData["farm_founded_year"] as? NSNumber)?.intValue else { return }
    var milestones: [ARFarmFoundingView.Milestone] = []
    if let arr = varietyData["farm_milestones"] as? NSArray {
      milestones = arr.compactMap { $0 as? NSDictionary }.compactMap { d -> ARFarmFoundingView.Milestone? in
        guard let y = (d["year"] as? NSNumber)?.intValue, let l = d["label"] as? String else { return nil }
        return ARFarmFoundingView.Milestone(year: y, label: l)
      }
    }
    let v = ARFarmFoundingView(foundedYear: year, milestones: milestones)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.22, height: 0.06)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(-0.28, 0.35, -0.62)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Feature 40: Irrigation diagram (UIKit — animated)
  private func setupIrrigationDiagram() {
    guard let method = varietyData["irrigation_method"] as? String, !method.isEmpty else { return }
    let v = ARIrrigationDiagramView(method: method)
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.widthAnchor.constraint(equalToConstant: 260),
      v.heightAnchor.constraint(equalToConstant: 110),
      v.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
      v.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 300),
    ])
  }

  // Feature 41: Cover crop
  private func setupCoverCrop() {
    guard let crop = varietyData["cover_crop"] as? String, !crop.isEmpty else { return }
    let v = ARCoverCropView(coverCrop: crop)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.20, height: 0.05)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0.28, 0.35, -0.62)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Feature 42: Microclimate
  private func setupMicroclimate() {
    guard let terrain = varietyData["terrain_type"] as? String, !terrain.isEmpty else { return }
    let wind = varietyData["prevailing_wind"] as? String ?? "N"
    let v = ARMicroclimateView(terrainType: terrain, prevailingWind: wind)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.20, height: 0.09)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(-0.30, -0.22, -0.62)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Feature 43: Bundle suggestion (UIKit overlay)
  private func setupBundleSuggestion() {
    guard let bs = varietyData["bundle_suggestion"] as? NSDictionary,
          let title = bs["title"] as? String,
          let cents = (bs["price_cents"] as? NSNumber)?.intValue else { return }
    let v = ARBundleSuggestionView(title: title, priceCents: cents)
    v.onTap = { [weak self] in self?.onBundleTap?() }
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.widthAnchor.constraint(equalToConstant: 280),
      v.heightAnchor.constraint(equalToConstant: 100),
      v.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      v.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -220),
    ])
  }

  // Feature 44: Early access countdown (UIKit overlay)
  private func setupEarlyAccessCountdown() {
    guard let dateStr = varietyData["upcoming_drop_at"] as? String else { return }
    let formatter = ISO8601DateFormatter()
    guard let date = formatter.date(from: dateStr), date > Date() else { return }
    let v = AREarlyAccessCountdownView(dropsAt: date)
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.widthAnchor.constraint(equalToConstant: 280),
      v.heightAnchor.constraint(equalToConstant: 90),
      v.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
      v.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 300),
    ])
  }

  // Feature 45: Price drop badge (UIKit overlay)
  private func setupPriceDropBadge() {
    guard let pct = (varietyData["price_drop_pct"] as? NSNumber)?.intValue, pct > 0 else { return }
    let v = ARPriceDropBadgeView(dropPercent: pct)
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.widthAnchor.constraint(equalToConstant: 170),
      v.heightAnchor.constraint(equalToConstant: 65),
      v.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
      v.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 180),
    ])
  }

  // Feature 46: Referral bubble (UIKit overlay)
  private func setupReferralBubble() {
    guard (varietyData["show_referral_bubble"] as? NSNumber)?.boolValue == true else { return }
    let v = ARReferralBubbleView()
    v.onTap = { [weak self] in
      self?.onReferralTap?()
      v.animateOut()
    }
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.widthAnchor.constraint(equalToConstant: 270),
      v.heightAnchor.constraint(equalToConstant: 80),
      v.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      v.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -310),
    ])
    v.animateIn()
  }

  // Feature 47: Gift registry (UIKit overlay)
  private func setupGiftRegistry() {
    let v = ARGiftRegistryView()
    v.onAdd = { [weak self] in
      self?.onGiftRegistryAdd?()
    }
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.widthAnchor.constraint(equalToConstant: 230),
      v.heightAnchor.constraint(equalToConstant: 60),
      v.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      v.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -390),
    ])
  }

  // Feature 48: Word cloud (SCNPlane)
  private func setupWordCloud() {
    guard let arr = varietyData["tasting_word_cloud"] as? NSArray, arr.count > 0 else { return }
    let words = arr.compactMap { $0 as? NSDictionary }.compactMap { d -> (word: String, count: Int)? in
      guard let w = d["word"] as? String, let c = (d["count"] as? NSNumber)?.intValue else { return nil }
      return (w, c)
    }
    guard !words.isEmpty else { return }
    let v = ARWordCloudView(words: words)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.22, height: 0.14)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(-0.32, 0.52, -0.65)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Feature 49: Who else got this (SCNPlane)
  private func setupWhoElseGotThis() {
    guard let arr = varietyData["batch_members"] as? NSArray, arr.count > 0 else { return }
    let members = arr.compactMap { $0 as? NSDictionary }.compactMap { d -> (initial: String, colorHex: String)? in
      guard let i = d["initial"] as? String, let c = d["colorHex"] as? String else { return nil }
      return (i, c)
    }
    guard !members.isEmpty else { return }
    let v = ARWhoElseGotThisView(members: members)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.20, height: 0.05)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0.0, -0.68, -0.60)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Feature 50: Memory lane
  private func setupMemoryLane() {
    guard let dateStr = varietyData["last_scan_date"] as? String else { return }
    let formatter = ISO8601DateFormatter()
    guard let date = formatter.date(from: dateStr) else { return }
    let rating = (varietyData["last_scan_rating"] as? NSNumber)?.intValue ?? 0
    let note = varietyData["last_scan_note"] as? String
    let v = ARMemoryLaneView(lastDate: date, rating: rating, note: note)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.19, height: 0.08)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0.32, 0.52, -0.65)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Feature 51: Challenge quest (UIKit overlay)
  private func setupChallengeQuest() {
    guard let ch = varietyData["collectif_challenge"] as? NSDictionary,
          let title = ch["title"] as? String else { return }
    let desc = ch["description"] as? String ?? ""
    let progress = (ch["progress"] as? NSNumber)?.intValue ?? 0
    let target = (ch["target"] as? NSNumber)?.intValue ?? 3
    let v = ARChallengeQuestView(title: title, description: desc, progress: progress, target: target)
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.widthAnchor.constraint(equalToConstant: 280),
      v.heightAnchor.constraint(equalToConstant: 130),
      v.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
      v.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 400),
    ])
  }

  // Feature 52: Co-scan QR (button + presented sheet)
  private func setupCoScanButton() {
    let btn = UIButton(type: .system)
    btn.setTitle("⟳ Co-Scan", for: .normal)
    btn.titleLabel?.font = UIFont.monospacedSystemFont(ofSize: 11, weight: .regular)
    btn.tintColor = UIColor.white.withAlphaComponent(0.5)
    btn.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(btn)
    btn.addTarget(self, action: #selector(handleCoScan), for: .touchUpInside)
    NSLayoutConstraint.activate([
      btn.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
      btn.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -60),
    ])
  }

  @objc private func handleCoScan() {
    let varId = String((varietyData["variety_id"] as? NSNumber)?.intValue ?? 0)
    let qrVC = UIViewController()
    let qrView = ARCoScanQRView(code: "fraise-coscan-\(varId)-\(Int(Date().timeIntervalSince1970))")
    qrView.onClose = { [weak qrVC] in qrVC?.dismiss(animated: true) }
    qrView.translatesAutoresizingMaskIntoConstraints = false
    qrVC.view.addSubview(qrView)
    qrVC.view.backgroundColor = UIColor.black.withAlphaComponent(0.85)
    NSLayoutConstraint.activate([
      qrView.centerXAnchor.constraint(equalTo: qrVC.view.centerXAnchor),
      qrView.centerYAnchor.constraint(equalTo: qrVC.view.centerYAnchor),
      qrView.widthAnchor.constraint(equalToConstant: 250),
      qrView.heightAnchor.constraint(equalToConstant: 300),
    ])
    qrVC.modalPresentationStyle = .overFullScreen
    present(qrVC, animated: true)
  }

  // Feature 53: Streak leaderboard
  private func setupStreakLeaderboard() {
    guard let arr = varietyData["variety_streak_leaders"] as? NSArray, arr.count > 0 else { return }
    let leaders = arr.compactMap { $0 as? NSDictionary }.compactMap { d -> (rank: Int, name: String, farmName: String, streakWeeks: Int)? in
      guard let rank = (d["rank"] as? NSNumber)?.intValue,
            let name = d["name"] as? String else { return nil }
      let farm = d["farmName"] as? String ?? ""
      let weeks = (d["streakWeeks"] as? NSNumber)?.intValue ?? 0
      return (rank, name, farm, weeks)
    }
    guard !leaders.isEmpty else { return }
    let currentRank = (varietyData["current_user_streak_rank"] as? NSNumber)?.intValue
    let v = ARVarietyStreakLeaderView(leaders: leaders, currentUserRank: currentRank)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.19, height: 0.13)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0.30, -0.62, -0.65)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Feature 54: Ambient audio player (UIKit overlay)
  private func setupAmbientAudio() {
    guard let urlStr = varietyData["ambient_audio_url"] as? String, !urlStr.isEmpty else { return }
    let v = ARAmbientAudioView(audioURL: urlStr)
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.widthAnchor.constraint(equalToConstant: 150),
      v.heightAnchor.constraint(equalToConstant: 65),
      v.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
      v.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -110),
    ])
  }

  // Feature 55: Shake to shuffle (CoreMotion)
  private func setupShakeToShuffle() {
    motionManager = CMMotionManager()
    guard motionManager?.isAccelerometerAvailable == true else { return }
    motionManager?.accelerometerUpdateInterval = 0.15
    var lastShake = Date.distantPast
    motionManager?.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
      guard let data = data else { return }
      let a = data.acceleration
      let mag = sqrt(a.x*a.x + a.y*a.y + a.z*a.z)
      guard mag > 2.5, Date().timeIntervalSince(lastShake) > 1.0 else { return }
      lastShake = Date()
      UIImpactFeedbackGenerator(style: .light).impactOccurred()
      let nodes = self?.sceneView.scene.rootNode.childNodes.filter { $0.geometry is SCNPlane } ?? []
      guard !nodes.isEmpty else { return }
      for node in nodes { node.isHidden = true }
      let idx = Int.random(in: 0..<nodes.count)
      nodes[idx].isHidden = false
    }
  }

  // Feature 56: Variety mascot (UIKit overlay)
  private func setupMascot() {
    guard let mascotId = varietyData["mascot_id"] as? String, !mascotId.isEmpty else { return }
    let v = ARVarietyMascotView(mascotId: mascotId)
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.widthAnchor.constraint(equalToConstant: 80),
      v.heightAnchor.constraint(equalToConstant: 80),
      v.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
      v.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -110),
    ])
  }

  // Staff: Feature 58 — Order expiry grid
  private func setupOrderExpiryGrid() {
    guard let arr = varietyData["staff_expiry_orders"] as? NSArray, arr.count > 0 else { return }
    let orders = arr.compactMap { $0 as? NSDictionary }.compactMap { d -> AROrderExpiryGridView.ExpiryOrder? in
      guard let id = (d["id"] as? NSNumber)?.intValue,
            let name = d["customerName"] as? String,
            let slotStr = d["slotTime"] as? String else { return nil }
      let formatter = ISO8601DateFormatter()
      let slotDate = formatter.date(from: slotStr) ?? Date()
      return AROrderExpiryGridView.ExpiryOrder(id: id, customerName: name, slotTime: slotDate)
    }
    guard !orders.isEmpty else { return }
    let v = AROrderExpiryGridView(orders: orders)
    v.onSelect = { [weak self] orderId in
      self?.onStaffAction?("view_order", orderId)
    }
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.widthAnchor.constraint(equalToConstant: 320),
      v.heightAnchor.constraint(equalToConstant: 290),
      v.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      v.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 80),
    ])
  }

  // Staff: Feature 59 — Performance rings
  private func setupStaffPerformance() {
    guard staffMode else { return }
    let orders = (varietyData["staff_orders_today"] as? NSNumber)?.intValue ?? 0
    guard orders > 0 else { return }
    let prep = (varietyData["staff_avg_prep_seconds"] as? NSNumber)?.intValue ?? 0
    let accuracy = (varietyData["staff_accuracy_pct"] as? NSNumber)?.doubleValue ?? 0
    let v = ARStaffPerformanceView(ordersToday: orders, avgPrepSeconds: prep, accuracyPct: accuracy)
    let img = UIGraphicsImageRenderer(size: v.bounds.size).image { ctx in v.layer.render(in: ctx.cgContext) }
    let plane = SCNPlane(width: 0.19, height: 0.13)
    plane.firstMaterial!.diffuse.contents = img
    plane.firstMaterial!.isDoubleSided = true
    let node = SCNNode(geometry: plane)
    node.position = SCNVector3(0.30, 0.30, -0.60)
    let bc = SCNBillboardConstraint(); bc.freeAxes = .all
    node.constraints = [bc]
    sceneView.scene.rootNode.addChildNode(node)
  }

  // Staff: Feature 60 — Postal heat map (UIKit overlay)
  private func setupPostalHeatMap() {
    guard staffMode,
          let arr = varietyData["postal_heat_map"] as? NSArray, arr.count > 0 else { return }
    let points = arr.compactMap { $0 as? NSDictionary }.compactMap { d -> ARPostalHeatMapView.PostalPoint? in
      guard let prefix = d["prefix"] as? String,
            let lat = (d["lat"] as? NSNumber)?.doubleValue,
            let lng = (d["lng"] as? NSNumber)?.doubleValue,
            let count = (d["count"] as? NSNumber)?.intValue else { return nil }
      return ARPostalHeatMapView.PostalPoint(prefix: prefix, lat: lat, lng: lng, count: count)
    }
    guard !points.isEmpty else { return }
    let v = ARPostalHeatMapView(postalCounts: points)
    v.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(v)
    NSLayoutConstraint.activate([
      v.widthAnchor.constraint(equalToConstant: 310),
      v.heightAnchor.constraint(equalToConstant: 210),
      v.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      v.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -80),
    ])
  }
}
