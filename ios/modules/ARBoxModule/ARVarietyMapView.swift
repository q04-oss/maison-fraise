import UIKit

/// Screen-space overlay showing a stylised dot-map of the user's scanned varieties,
/// plotted using normalised lat/lng within a France/Québec bounding box.
class ARVarietyMapView: UIView {

  // MARK: - Public types
  struct MapVariety {
    let varietyId: Int
    let varietyName: String
    let lat: Double?
    let lng: Double?
  }

  // MARK: - Private state
  private var varieties: [MapVariety] = []

  // MARK: - Colours
  private let accent  = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let muted   = UIColor(red: 0.5,   green: 0.47,  blue: 0.44,  alpha: 1)
  private let darkBg  = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.92)
  private let mapBg   = UIColor(red: 0.12,  green: 0.11,  blue: 0.10,  alpha: 1)

  // MARK: - Subviews
  private let headerLabel  = UILabel()
  private let mapContainer = UIView()
  private let countLabel   = UILabel()

  // MARK: - Constants
  private let latMin: Double = 43, latMax: Double = 52
  private let lngMin: Double = -80, lngMax: Double = 10
  private let dotSize: CGFloat = 8
  private let maxDisplayed = 20

  // MARK: - Init
  init() {
    super.init(frame: .zero)
    setupViews()
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Setup
  private func setupViews() {
    layer.cornerRadius = 16
    layer.masksToBounds = true
    backgroundColor = darkBg

    headerLabel.text = "MY VARIETIES"
    headerLabel.font = UIFont.monospacedSystemFont(ofSize: 10, weight: .semibold)
    headerLabel.textColor = accent
    headerLabel.translatesAutoresizingMaskIntoConstraints = false
    addSubview(headerLabel)

    mapContainer.backgroundColor = mapBg
    mapContainer.layer.cornerRadius = 8
    mapContainer.layer.masksToBounds = true
    mapContainer.translatesAutoresizingMaskIntoConstraints = false
    addSubview(mapContainer)

    countLabel.font = UIFont.monospacedSystemFont(ofSize: 9, weight: .regular)
    countLabel.textColor = muted
    countLabel.textAlignment = .right
    countLabel.translatesAutoresizingMaskIntoConstraints = false
    addSubview(countLabel)

    NSLayoutConstraint.activate([
      headerLabel.topAnchor.constraint(equalTo: topAnchor, constant: 10),
      headerLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),

      mapContainer.topAnchor.constraint(equalTo: headerLabel.bottomAnchor, constant: 8),
      mapContainer.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
      mapContainer.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
      mapContainer.bottomAnchor.constraint(equalTo: countLabel.topAnchor, constant: -6),

      countLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),
      countLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12)
    ])
  }

  // MARK: - Public
  func configure(varieties: [MapVariety]) {
    self.varieties = varieties
    countLabel.text = "\(varieties.count) \(varieties.count == 1 ? "variety" : "varieties")"
    setNeedsLayout()
    layoutIfNeeded()
  }

  // MARK: - Layout dots
  override func layoutSubviews() {
    super.layoutSubviews()
    guard mapContainer.bounds.width > 0, mapContainer.bounds.height > 0 else { return }

    // Remove old dots
    mapContainer.subviews.forEach { $0.removeFromSuperview() }

    let located   = varieties.filter { $0.lat != nil && $0.lng != nil }.prefix(maxDisplayed)
    let unlocated = varieties.filter { $0.lat == nil || $0.lng == nil }

    let mapW = mapContainer.bounds.width
    let mapH = mapContainer.bounds.height
    // Reserve bottom strip for unlocated dots
    let unlocatedStripH: CGFloat = unlocated.isEmpty ? 0 : 18
    let plotH = mapH - unlocatedStripH - 4

    for variety in located {
      guard let lat = variety.lat, let lng = variety.lng else { continue }
      let clampedLat = max(latMin, min(latMax, lat))
      let clampedLng = max(lngMin, min(lngMax, lng))

      // Normalize (lat is inverted: higher lat = lower Y)
      let xFrac = CGFloat((clampedLng - lngMin) / (lngMax - lngMin))
      let yFrac = CGFloat(1 - (clampedLat - latMin) / (latMax - latMin))

      let cx = xFrac * (mapW - dotSize) + dotSize / 2
      let cy = yFrac * (plotH - dotSize) + dotSize / 2

      addDot(at: CGPoint(x: cx, y: cy),
             name: variety.varietyName,
             color: accent,
             in: mapContainer)
    }

    // Unlocated dots in a row at the bottom
    if !unlocated.isEmpty {
      let step: CGFloat = 14
      let rowY = mapH - unlocatedStripH + 4
      for (i, variety) in unlocated.prefix(maxDisplayed).enumerated() {
        let cx = 8 + CGFloat(i) * step + dotSize / 2
        addDot(at: CGPoint(x: cx, y: rowY),
               name: variety.varietyName,
               color: muted,
               in: mapContainer)
      }
    }
  }

  private func addDot(at center: CGPoint, name: String, color: UIColor, in parent: UIView) {
    let dot = UIView(frame: CGRect(x: center.x - dotSize / 2,
                                   y: center.y - dotSize / 2,
                                   width: dotSize, height: dotSize))
    dot.backgroundColor = color
    dot.layer.cornerRadius = dotSize / 2
    parent.addSubview(dot)

    // Short name label below dot
    let label = UILabel()
    label.text = String(name.prefix(4))
    label.font = UIFont.monospacedSystemFont(ofSize: 5, weight: .regular)
    label.textColor = color.withAlphaComponent(0.7)
    label.sizeToFit()
    label.center = CGPoint(x: center.x, y: center.y + dotSize / 2 + label.bounds.height / 2 + 1)
    parent.addSubview(label)
  }
}
