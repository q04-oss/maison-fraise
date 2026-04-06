import UIKit

/// Progress-bar view showing how many days remain before the optimal eating window closes.
/// Renders to 260×90 pt as a UIView → texture for SCNPlane.
class AROptimalEatingView: UIView {

  private let harvestDate: String?
  private let eatByDays: Int

  private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let bg     = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)
  private let muted  = UIColor(white: 1.0, alpha: 0.40)

  // Pre-computed values
  private let harvest: Date?
  private let eatByDate: Date?
  private let daysRemaining: Int?
  private let fraction: CGFloat?
  private let barColor: UIColor?

  init(harvestDate: String?, eatByDays: Int?) {
    self.harvestDate = harvestDate
    self.eatByDays   = eatByDays ?? 7

    if let dateStr = harvestDate, let h = AROptimalEatingView.parseDate(dateStr) {
      let days   = eatByDays ?? 7
      let now    = Date()
      let daysOld     = Int(floor(now.timeIntervalSince(h) / 86400))
      let remaining   = days - daysOld
      let frac        = max(0, min(1, CGFloat(daysOld) / CGFloat(days)))
      let ebd         = h.addingTimeInterval(Double(days) * 86400)

      harvest      = h
      eatByDate    = ebd
      daysRemaining = remaining
      fraction     = frac
      if frac < 0.5 {
        barColor = UIColor(red: 0.18, green: 0.72, blue: 0.36, alpha: 1)
      } else if frac < 0.85 {
        barColor = UIColor(red: 0.95, green: 0.65, blue: 0.15, alpha: 1)
      } else {
        barColor = UIColor(red: 0.85, green: 0.24, blue: 0.18, alpha: 1)
      }
    } else {
      harvest       = nil
      eatByDate     = nil
      daysRemaining = nil
      fraction      = nil
      barColor      = nil
    }

    super.init(frame: CGRect(x: 0, y: 0, width: 260, height: 90))
    backgroundColor = .clear
    isOpaque = false
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Date parsing (copied from ARSeasonalTimelineView)

  private static func parseDate(_ s: String) -> Date? {
    let fmts = ["yyyy-MM-dd'T'HH:mm:ssZ", "yyyy-MM-dd'T'HH:mm:ss.SSSZ", "yyyy-MM-dd"]
    for fmt in fmts {
      let f = DateFormatter(); f.dateFormat = fmt
      if let d = f.date(from: s) { return d }
    }
    return nil
  }

  // MARK: - Drawing

  override func draw(_ rect: CGRect) {
    // Background pill
    let bgPath = UIBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: rect.height / 2 - 1)
    bg.setFill()
    bgPath.fill()

    // No harvest date fallback
    guard let eatDate = eatByDate,
          let remaining = daysRemaining,
          let frac = fraction,
          let color = barColor else {
      let fallbackAttr: [NSAttributedString.Key: Any] = [
        .font: UIFont.monospacedSystemFont(ofSize: 11, weight: .regular),
        .foregroundColor: muted
      ]
      let msg = "Eat within 7 days of harvest" as NSString
      let msgSize = msg.size(withAttributes: fallbackAttr)
      msg.draw(
        at: CGPoint(x: rect.midX - msgSize.width / 2, y: rect.midY - msgSize.height / 2),
        withAttributes: fallbackAttr
      )
      return
    }

    let padX: CGFloat = 16
    let headerAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
      .foregroundColor: muted
    ]
    ("EAT BY" as NSString).draw(at: CGPoint(x: padX, y: 12), withAttributes: headerAttr)

    // Progress bar
    let barY: CGFloat    = 30
    let barH: CGFloat    = 6
    let barW             = rect.width - padX * 2
    let trackRect        = CGRect(x: padX, y: barY, width: barW, height: barH)
    let fillRect         = CGRect(x: padX, y: barY, width: barW * frac, height: barH)

    let trackPath = UIBezierPath(roundedRect: trackRect, cornerRadius: barH / 2)
    UIColor.white.withAlphaComponent(0.15).setFill()
    trackPath.fill()

    if frac > 0 {
      let fillPath = UIBezierPath(roundedRect: fillRect, cornerRadius: barH / 2)
      color.setFill()
      fillPath.fill()
    }

    // Eat-by date label (left)
    let df = DateFormatter()
    df.dateFormat = "MMM d"
    let dateStr = df.string(from: eatDate) as NSString
    let dateAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: 11, weight: .regular),
      .foregroundColor: UIColor.white
    ]
    dateStr.draw(at: CGPoint(x: padX, y: barY + barH + 8), withAttributes: dateAttr)

    // Days-remaining label (right)
    let rightLabel: NSString
    if remaining <= 0 {
      rightLabel = (remaining == 0 ? "TODAY" : "OVERDUE") as NSString
    } else {
      rightLabel = "\(remaining) days left" as NSString
    }
    let rightAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: 11, weight: .bold),
      .foregroundColor: color
    ]
    let rightSize = rightLabel.size(withAttributes: rightAttr)
    rightLabel.draw(
      at: CGPoint(x: rect.width - padX - rightSize.width, y: barY + barH + 8),
      withAttributes: rightAttr
    )
  }
}
