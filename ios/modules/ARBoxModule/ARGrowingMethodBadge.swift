import UIKit

/// Circular badge showing the growing method (organic / biodynamic / conventional) with an
/// optional moon-phase emoji for biodynamic harvests. Renders to 140×140 pt as a circle.
class ARGrowingMethodBadge: UIView {

  private let growingMethod: String?
  private let moonPhase: String?

  private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let bg     = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)
  private let muted  = UIColor(white: 1.0, alpha: 0.40)

  init(growingMethod: String?, moonPhase: String?) {
    self.growingMethod = growingMethod
    self.moonPhase     = moonPhase
    super.init(frame: CGRect(x: 0, y: 0, width: 140, height: 140))
    backgroundColor = .clear
    isOpaque = false
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Helpers

  private var methodKey: String { (growingMethod ?? "").lowercased() }

  private var isOrganic:     Bool { methodKey == "organic" }
  private var isBiodynamic:  Bool { methodKey == "biodynamic" }
  private var isConventional: Bool { !isOrganic && !isBiodynamic }

  private var methodIcon: String {
    if isOrganic || isBiodynamic { return "🌿" }
    return "⚙"
  }

  private var methodLabel: String {
    if isOrganic      { return "ORGANIC" }
    if isBiodynamic   { return "BIODYNAMIC" }
    return "CONVENTIONAL"
  }

  private var moonEmoji: String {
    guard isBiodynamic, let phase = moonPhase else { return "" }
    switch phase {
    case "new":             return "🌑"
    case "waxing_crescent": return "🌒"
    case "first_quarter":   return "🌓"
    case "waxing_gibbous":  return "🌔"
    case "full":            return "🌕"
    case "waning_gibbous":  return "🌖"
    case "last_quarter":    return "🌗"
    case "waning_crescent": return "🌘"
    default:                return ""
    }
  }

  // MARK: - Drawing

  override func draw(_ rect: CGRect) {
    guard let ctx = UIGraphicsGetCurrentContext() else { return }

    let center = CGPoint(x: rect.midX, y: rect.midY)
    let radius: CGFloat = rect.width / 2 - 2

    // Background circle
    ctx.saveGState()
    bg.setFill()
    ctx.addArc(center: center, radius: radius, startAngle: 0, endAngle: .pi * 2, clockwise: false)
    ctx.fillPath()
    ctx.restoreGState()

    // Accent border
    ctx.saveGState()
    accent.setStroke()
    ctx.setLineWidth(3)
    ctx.addArc(center: center, radius: radius - 1.5, startAngle: 0, endAngle: .pi * 2, clockwise: false)
    ctx.strokePath()
    ctx.restoreGState()

    // Method icon (top-center)
    let iconAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: 20)
    ]
    let icon = methodIcon as NSString
    let iconSize = icon.size(withAttributes: iconAttr)
    let iconY: CGFloat = 22
    icon.draw(at: CGPoint(x: rect.midX - iconSize.width / 2, y: iconY), withAttributes: iconAttr)

    // Method name ALLCAPS
    let nameAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedSystemFont(ofSize: 11, weight: .bold),
      .foregroundColor: accent
    ]
    let name = methodLabel as NSString
    let nameSize = name.size(withAttributes: nameAttr)
    let nameY = iconY + iconSize.height + 6
    name.draw(at: CGPoint(x: rect.midX - nameSize.width / 2, y: nameY), withAttributes: nameAttr)

    // Moon phase emoji (biodynamic only)
    var moonY = nameY + nameSize.height + 5
    let emoji = moonEmoji
    if !emoji.isEmpty {
      let emojiAttr: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 14)
      ]
      let emojiStr = emoji as NSString
      let emojiSize = emojiStr.size(withAttributes: emojiAttr)
      emojiStr.draw(
        at: CGPoint(x: rect.midX - emojiSize.width / 2, y: moonY),
        withAttributes: emojiAttr
      )
      moonY += emojiSize.height + 2
    }

    // "AT HARVEST" footer
    let footerAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
      .foregroundColor: muted
    ]
    let footer = "AT HARVEST" as NSString
    let footerSize = footer.size(withAttributes: footerAttr)
    let footerY = rect.height - footerSize.height - 12
    footer.draw(
      at: CGPoint(x: rect.midX - footerSize.width / 2, y: footerY),
      withAttributes: footerAttr
    )
  }
}
