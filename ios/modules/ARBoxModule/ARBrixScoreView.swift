import UIKit

/// Displays the Brix sugar-content score for a fruit variety with a tiered colour bar.
/// Renders to 280×120 pt as a UIView → texture for SCNPlane.
class ARBrixScoreView: UIView {

  private let brixScore: Double?

  private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let bg     = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)
  private let muted  = UIColor(white: 1.0, alpha: 0.40)
  private let green  = UIColor(red: 0.18, green: 0.72, blue: 0.36, alpha: 1)

  init(brixScore: Double?) {
    self.brixScore = brixScore
    super.init(frame: CGRect(x: 0, y: 0, width: 280, height: 120))
    backgroundColor = .clear
    isOpaque = false
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Drawing

  override func draw(_ rect: CGRect) {
    guard let ctx = UIGraphicsGetCurrentContext() else { return }

    // Background rounded rect
    let bgPath = UIBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: 14)
    bg.setFill()
    bgPath.fill()

    let leftW: CGFloat   = rect.width * 0.55
    let rightX: CGFloat  = leftW
    let rightW: CGFloat  = rect.width - leftW

    // MARK: Left half — °Brix label + score number
    let brixLabel = "°Brix" as NSString
    let brixAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedSystemFont(ofSize: 9, weight: .regular),
      .foregroundColor: muted
    ]
    let brixLabelSize = brixLabel.size(withAttributes: brixAttr)
    let brixLabelOrigin = CGPoint(x: 20, y: 22)
    brixLabel.draw(at: brixLabelOrigin, withAttributes: brixAttr)

    let scoreStr: NSString
    let scoreColor: UIColor
    if let score = brixScore {
      scoreStr  = NSString(format: "%.1f", score)
      scoreColor = .white
    } else {
      scoreStr  = "N/A"
      scoreColor = muted
    }
    let scoreAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: 36, weight: .bold),
      .foregroundColor: scoreColor
    ]
    let scoreSize = scoreStr.size(withAttributes: scoreAttr)
    let scoreOrigin = CGPoint(x: 20, y: brixLabelOrigin.y + brixLabelSize.height + 4)
    scoreStr.draw(at: scoreOrigin, withAttributes: scoreAttr)

    // Footer tier label
    let tierText: NSString
    if let score = brixScore {
      if score < 9      { tierText = "low sweetness" }
      else if score <= 12 { tierText = "balanced" }
      else               { tierText = "very sweet" }
    } else {
      tierText = ""
    }
    if tierText.length > 0 {
      let tierAttr: [NSAttributedString.Key: Any] = [
        .font: UIFont.monospacedSystemFont(ofSize: 9, weight: .regular),
        .foregroundColor: muted
      ]
      let tierY = rect.height - 18
      tierText.draw(at: CGPoint(x: 20, y: tierY), withAttributes: tierAttr)
    }

    // MARK: Right half — tiered colour bars + marker
    let barW: CGFloat   = 60
    let barH: CGFloat   = 6
    let barSpacing: CGFloat = 4
    let totalBarsH: CGFloat = 3 * barH + 2 * barSpacing
    let barsStartY: CGFloat = (rect.height - totalBarsH) / 2
    let barsStartX: CGFloat = rightX + (rightW - barW - 14) / 2

    let barColors: [UIColor] = [
      UIColor(white: 1.0, alpha: 0.20),  // Low
      accent,                             // Mid
      green                               // High
    ]
    let barLabels = ["Low", "Mid", "High"]

    // Determine active tier (index 0=Low, 1=Mid, 2=High)
    var activeTier = -1
    if let score = brixScore {
      if score < 9       { activeTier = 0 }
      else if score <= 12 { activeTier = 1 }
      else               { activeTier = 2 }
    }

    // Draw bars from High (top) → Low (bottom) so High is at top
    for i in 0..<3 {
      let displayIndex = 2 - i   // reverse: High first
      let barY = barsStartY + CGFloat(i) * (barH + barSpacing)
      let barRect = CGRect(x: barsStartX, y: barY, width: barW, height: barH)
      let barPath = UIBezierPath(roundedRect: barRect, cornerRadius: barH / 2)
      barColors[displayIndex].setFill()
      barPath.fill()

      // Small tier label to the left
      let lblAttr: [NSAttributedString.Key: Any] = [
        .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
        .foregroundColor: muted
      ]
      (barLabels[displayIndex] as NSString).draw(
        at: CGPoint(x: barsStartX - 28, y: barY - 1),
        withAttributes: lblAttr
      )

      // Triangle marker on the right for the active tier
      if displayIndex == activeTier {
        let markerX = barsStartX + barW + 5
        let midY    = barY + barH / 2
        let triSize: CGFloat = 5
        ctx.saveGState()
        barColors[displayIndex].setFill()
        let tri = UIBezierPath()
        tri.move(to: CGPoint(x: markerX, y: midY - triSize / 2))
        tri.addLine(to: CGPoint(x: markerX, y: midY + triSize / 2))
        tri.addLine(to: CGPoint(x: markerX + triSize, y: midY))
        tri.close()
        tri.fill()
        ctx.restoreGState()
      }
    }
  }
}
