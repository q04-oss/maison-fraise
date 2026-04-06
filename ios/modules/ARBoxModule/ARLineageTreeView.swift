import UIKit

/// Simple three-node lineage tree (two parents → child variety).
/// Renders to 300×110 pt as a UIView → texture for SCNPlane.
class ARLineageTreeView: UIView {

  private let parentA: String?
  private let parentB: String?
  private let varietyName: String

  private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let bg     = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)
  private let muted  = UIColor(white: 1.0, alpha: 0.40)
  private let line   = UIColor.white.withAlphaComponent(0.40)

  init(parentA: String?, parentB: String?, varietyName: String) {
    self.parentA     = parentA
    self.parentB     = parentB
    self.varietyName = varietyName
    super.init(frame: CGRect(x: 0, y: 0, width: 300, height: 110))
    backgroundColor = .clear
    isOpaque = false
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Drawing

  override func draw(_ rect: CGRect) {
    guard let ctx = UIGraphicsGetCurrentContext() else { return }

    // Background
    let bgPath = UIBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: 12)
    bg.setFill()
    bgPath.fill()

    // MARK: Header
    let headerAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
      .foregroundColor: muted
    ]
    ("LINEAGE" as NSString).draw(at: CGPoint(x: 14, y: 10), withAttributes: headerAttr)

    // MARK: Layout constants
    let parentBoxW: CGFloat  = 100
    let parentBoxH: CGFloat  = 24
    let parentBoxY: CGFloat  = 30
    let childBoxW: CGFloat   = 130
    let childBoxH: CGFloat   = 28
    let childBoxY: CGFloat   = rect.height - childBoxH - 14

    let leftBoxX  = (rect.width / 2 - parentBoxW) / 2 - 4  // ~46
    let rightBoxX = rect.width - leftBoxX - parentBoxW       // mirrored

    // Centers of parent boxes (bottom edge)
    let leftCenterX  = leftBoxX  + parentBoxW / 2
    let rightCenterX = rightBoxX + parentBoxW / 2
    let parentBottomY = parentBoxY + parentBoxH

    // Child box center
    let childBoxX    = (rect.width - childBoxW) / 2
    let childCenterX = childBoxX + childBoxW / 2
    let childTopY    = childBoxY

    // Midpoint Y for the horizontal connector
    let midY: CGFloat = parentBottomY + (childTopY - parentBottomY) * 0.5

    // MARK: Branch lines
    ctx.saveGState()
    line.setStroke()
    ctx.setLineWidth(1.5)
    ctx.setLineCap(.round)

    // Left parent → midY
    ctx.move(to: CGPoint(x: leftCenterX, y: parentBottomY))
    ctx.addLine(to: CGPoint(x: leftCenterX, y: midY))
    // Right parent → midY
    ctx.move(to: CGPoint(x: rightCenterX, y: parentBottomY))
    ctx.addLine(to: CGPoint(x: rightCenterX, y: midY))
    // Horizontal connector
    ctx.move(to: CGPoint(x: leftCenterX, y: midY))
    ctx.addLine(to: CGPoint(x: rightCenterX, y: midY))
    // Vertical down to child
    ctx.move(to: CGPoint(x: childCenterX, y: midY))
    ctx.addLine(to: CGPoint(x: childCenterX, y: childTopY))
    ctx.strokePath()
    ctx.restoreGState()

    // MARK: Parent boxes
    func drawParentBox(x: CGFloat, name: String?) {
      let boxRect = CGRect(x: x, y: parentBoxY, width: parentBoxW, height: parentBoxH)
      let path = UIBezierPath(roundedRect: boxRect, cornerRadius: 5)
      UIColor.white.withAlphaComponent(0.08).setFill()
      path.fill()
      UIColor.white.withAlphaComponent(0.18).setStroke()
      path.lineWidth = 1
      path.stroke()

      let label: NSString = (name != nil ? name! : "Unknown") as NSString
      let labelColor: UIColor = name != nil ? .white : muted
      let attr: [NSAttributedString.Key: Any] = [
        .font: UIFont.monospacedSystemFont(ofSize: 10, weight: .regular),
        .foregroundColor: labelColor
      ]
      let labelSize = label.size(withAttributes: attr)
      label.draw(
        at: CGPoint(
          x: x + (parentBoxW - labelSize.width) / 2,
          y: parentBoxY + (parentBoxH - labelSize.height) / 2
        ),
        withAttributes: attr
      )
    }

    drawParentBox(x: leftBoxX,  name: parentA)
    drawParentBox(x: rightBoxX, name: parentB)

    // MARK: Child box
    let childRect = CGRect(x: childBoxX, y: childBoxY, width: childBoxW, height: childBoxH)
    let childPath = UIBezierPath(roundedRect: childRect, cornerRadius: 7)
    accent.setFill()
    childPath.fill()

    let childAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedSystemFont(ofSize: 10, weight: .bold),
      .foregroundColor: UIColor.white
    ]
    let childLabel = varietyName as NSString
    let childLabelSize = childLabel.size(withAttributes: childAttr)
    childLabel.draw(
      at: CGPoint(
        x: childBoxX + (childBoxW - childLabelSize.width) / 2,
        y: childBoxY + (childBoxH - childLabelSize.height) / 2
      ),
      withAttributes: childAttr
    )
  }
}
