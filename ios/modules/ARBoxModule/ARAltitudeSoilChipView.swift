import UIKit

/// Two-chip display showing altitude and soil type for a growing location.
/// Renders to 220×80 pt as a UIView → texture for SCNPlane.
class ARAltitudeSoilChipView: UIView {

  private let altitudeM: Int?
  private let soilType: String?

  private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let bg     = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)
  private let muted  = UIColor(white: 1.0, alpha: 0.40)

  init(altitudeM: Int?, soilType: String?) {
    self.altitudeM = altitudeM
    self.soilType  = soilType
    super.init(frame: CGRect(x: 0, y: 0, width: 220, height: 80))
    backgroundColor = .clear
    isOpaque = false
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Drawing

  override func draw(_ rect: CGRect) {
    // Background pill
    let bgPath = UIBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: rect.height / 2 - 1)
    bg.setFill()
    bgPath.fill()

    let halfW = rect.width / 2

    // MARK: Left chip — altitude
    let altValue: NSString = altitudeM != nil ? "\(altitudeM!)m" as NSString : "—" as NSString
    drawChip(
      icon: "▲",
      value: altValue,
      label: "ALTITUDE",
      originX: 0,
      width: halfW,
      rect: rect
    )

    // MARK: Vertical divider
    let dividerX = halfW
    let dividerPath = UIBezierPath()
    dividerPath.move(to: CGPoint(x: dividerX, y: 14))
    dividerPath.addLine(to: CGPoint(x: dividerX, y: rect.height - 14))
    UIColor.white.withAlphaComponent(0.15).setStroke()
    dividerPath.lineWidth = 1
    dividerPath.stroke()

    // MARK: Right chip — soil
    let soilValue: NSString = (soilType != nil ? soilType! : "—") as NSString
    drawChip(
      icon: "◆",
      value: soilValue,
      label: "SOIL",
      originX: halfW,
      width: halfW,
      rect: rect
    )
  }

  private func drawChip(
    icon: String,
    value: NSString,
    label: String,
    originX: CGFloat,
    width: CGFloat,
    rect: CGRect
  ) {
    let contentCenterX = originX + width / 2
    let totalH: CGFloat = rect.height
    let rowY: CGFloat   = totalH / 2 - 16

    // Icon + value on same baseline
    let iconAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedSystemFont(ofSize: 13, weight: .bold),
      .foregroundColor: UIColor.white.withAlphaComponent(0.60)
    ]
    let iconStr = icon as NSString
    let iconSize = iconStr.size(withAttributes: iconAttr)

    // Value font — larger for altitude, smaller for soil (to fit longer strings)
    let valueFontSize: CGFloat = label == "ALTITUDE" ? 13 : 10
    let valueAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedSystemFont(ofSize: valueFontSize, weight: .bold),
      .foregroundColor: UIColor.white
    ]
    let valueSize = value.size(withAttributes: valueAttr)

    let gap: CGFloat      = 4
    let rowTotalW         = iconSize.width + gap + valueSize.width
    let rowStartX         = contentCenterX - rowTotalW / 2
    let rowCenterY        = totalH / 2 - 6

    iconStr.draw(
      at: CGPoint(x: rowStartX, y: rowCenterY - iconSize.height / 2),
      withAttributes: iconAttr
    )
    value.draw(
      at: CGPoint(x: rowStartX + iconSize.width + gap, y: rowCenterY - valueSize.height / 2),
      withAttributes: valueAttr
    )

    // Sub-label
    let subAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
      .foregroundColor: muted
    ]
    let subStr  = label as NSString
    let subSize = subStr.size(withAttributes: subAttr)
    subStr.draw(
      at: CGPoint(x: contentCenterX - subSize.width / 2, y: rowCenterY + valueSize.height / 2 + 5),
      withAttributes: subAttr
    )
  }
}
