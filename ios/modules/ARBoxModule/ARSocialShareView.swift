import UIKit

/// Off-screen compositing view that renders a 1080×1920 Instagram-story share card.
/// Not intended for live display — call `renderToImage()` to obtain the composited UIImage.
class ARSocialShareView: UIView {

  // MARK: - Data
  private let varietyName: String
  private let farmName: String
  private let harvestDate: String?
  private let seasonStart: String?
  private let seasonEnd: String?

  // MARK: - Colours
  private let accent   = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let cream    = UIColor(red: 0.969, green: 0.961, blue: 0.949, alpha: 1)
  private let dark     = UIColor(red: 0.10,  green: 0.09,  blue: 0.08,  alpha: 1)
  private let muted    = UIColor(red: 0.50,  green: 0.47,  blue: 0.44,  alpha: 1)

  // MARK: - Init
  init(varietyName: String, farmName: String, harvestDate: String?,
       seasonStart: String?, seasonEnd: String?) {
    self.varietyName  = varietyName
    self.farmName     = farmName
    self.harvestDate  = harvestDate
    self.seasonStart  = seasonStart
    self.seasonEnd    = seasonEnd
    super.init(frame: CGRect(x: 0, y: 0, width: 1080, height: 1920))
    backgroundColor = .clear
    isOpaque = false
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Render
  func renderToImage() -> UIImage {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: 1080, height: 1920))
    return renderer.image { _ in
      self.drawHierarchy(in: self.bounds, afterScreenUpdates: true)
    }
  }

  // MARK: - Drawing
  override func draw(_ rect: CGRect) {
    guard let ctx = UIGraphicsGetCurrentContext() else { return }

    // Background
    cream.setFill()
    ctx.fill(rect)

    // Accent rule at y: 180
    accent.setFill()
    ctx.fill(CGRect(x: 0, y: 180, width: 1080, height: 3))

    // Accent rule at y: 1800
    ctx.fill(CGRect(x: 0, y: 1800, width: 1080, height: 3))

    // "maison fraise" italic
    let maisonFont = UIFont.italicSystemFont(ofSize: 72)
    let maisonAttrs: [NSAttributedString.Key: Any] = [.font: maisonFont, .foregroundColor: dark]
    let maisonStr = "maison fraise" as NSString
    let maisonSize = maisonStr.size(withAttributes: maisonAttrs)
    maisonStr.draw(at: CGPoint(x: (1080 - maisonSize.width) / 2, y: 200), withAttributes: maisonAttrs)

    // Variety name
    let varietyFont = UIFont.systemFont(ofSize: 96, weight: .bold)
    let varietyAttrs: [NSAttributedString.Key: Any] = [.font: varietyFont, .foregroundColor: dark]
    let varietyStr = varietyName as NSString
    let varietySize = varietyStr.size(withAttributes: varietyAttrs)
    varietyStr.draw(at: CGPoint(x: (1080 - varietySize.width) / 2, y: 320), withAttributes: varietyAttrs)

    // Farm name
    let farmFont = UIFont.monospacedSystemFont(ofSize: 32, weight: .regular)
    let farmAttrs: [NSAttributedString.Key: Any] = [.font: farmFont, .foregroundColor: muted]
    let farmStr = farmName as NSString
    let farmSize = farmStr.size(withAttributes: farmAttrs)
    farmStr.draw(at: CGPoint(x: (1080 - farmSize.width) / 2, y: 460), withAttributes: farmAttrs)

    // Season bar (y: 550, width 800 centered, height 16)
    let barX: CGFloat    = (1080 - 800) / 2
    let barY: CGFloat    = 550
    let barW: CGFloat    = 800
    let barH: CGFloat    = 16
    let barRadius: CGFloat = 8

    // Track
    let trackPath = UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barW, height: barH),
                                  cornerRadius: barRadius)
    muted.withAlphaComponent(0.25).setFill()
    trackPath.fill()

    // Season fill using year-fraction logic
    if let startStr = seasonStart, let endStr = seasonEnd,
       let startDate = Self.parseDate(startStr), let endDate = Self.parseDate(endStr) {
      let startFrac = Self.yearFraction(startDate)
      let endFrac   = Self.yearFraction(endDate)
      let fillW = (endFrac - startFrac) * barW
      if fillW > 0 {
        let fillPath = UIBezierPath(roundedRect: CGRect(x: barX + startFrac * barW,
                                                         y: barY, width: fillW, height: barH),
                                    cornerRadius: barRadius)
        accent.setFill()
        fillPath.fill()
      }
    }

    // "HARVESTED" + date
    if let harvest = harvestDate, let date = Self.parseDate(harvest) {
      let df = DateFormatter(); df.dateFormat = "MMM d"
      let harvestText = "HARVESTED  \(df.string(from: date))" as NSString
      let harvestFont = UIFont.monospacedSystemFont(ofSize: 24, weight: .regular)
      let harvestAttrs: [NSAttributedString.Key: Any] = [.font: harvestFont, .foregroundColor: muted]
      let harvestSize = harvestText.size(withAttributes: harvestAttrs)
      harvestText.draw(at: CGPoint(x: (1080 - harvestSize.width) / 2, y: 600), withAttributes: harvestAttrs)
    }

    // Bottom tagline
    let tagFont = UIFont.italicSystemFont(ofSize: 28)
    let tagAttrs: [NSAttributedString.Key: Any] = [.font: tagFont, .foregroundColor: muted]
    let tagStr = "scan the chip." as NSString
    let tagSize = tagStr.size(withAttributes: tagAttrs)
    tagStr.draw(at: CGPoint(x: (1080 - tagSize.width) / 2, y: 1750), withAttributes: tagAttrs)
  }

  // MARK: - Helpers
  private static func parseDate(_ s: String) -> Date? {
    let fmts = ["yyyy-MM-dd'T'HH:mm:ssZ", "yyyy-MM-dd'T'HH:mm:ss.SSSZ", "yyyy-MM-dd"]
    for fmt in fmts {
      let f = DateFormatter(); f.dateFormat = fmt
      if let d = f.date(from: s) { return d }
    }
    return nil
  }

  private static func yearFraction(_ date: Date) -> CGFloat {
    let cal  = Calendar.current
    let year = cal.component(.year, from: date)
    let jan1 = cal.date(from: DateComponents(year: year, month: 1, day: 1))!
    let dec31 = cal.date(from: DateComponents(year: year, month: 12, day: 31))!
    let total = dec31.timeIntervalSince(jan1)
    return CGFloat(date.timeIntervalSince(jan1) / total)
  }
}
