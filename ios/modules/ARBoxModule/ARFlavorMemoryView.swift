// ARFlavorMemoryView.swift
// Overlapping radar/pentagon chart comparing today's flavor profile to the user's personal best.
// Renders at 260×260 pt for use as an SCNPlane texture.

import UIKit

class ARFlavorMemoryView: UIView {

    struct FlavorProfile {
        let sweetness: Double  // 0-10
        let acidity: Double    // 0-10
        let aroma: Double      // 0-10
        let texture: Double    // 0-10
        let intensity: Double  // 0-10
    }

    private let current: FlavorProfile
    private let personalBest: FlavorProfile

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)

    private let axisAngles: [CGFloat] = [270, 342, 54, 126, 198].map { $0 * .pi / 180 }
    private let axisLabels = ["SWEET", "ACID", "AROMA", "TEXTURE", "INTENSE"]

    init(current: FlavorProfile, personalBest: FlavorProfile) {
        self.current = current
        self.personalBest = personalBest
        super.init(frame: CGRect(x: 0, y: 0, width: 260, height: 260))
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        // Background pill
        let pill = UIBezierPath(roundedRect: rect, cornerRadius: 22)
        bg.setFill()
        pill.fill()
        UIColor.white.withAlphaComponent(0.08).setStroke()
        pill.lineWidth = 1
        pill.stroke()

        // Header
        let headerAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.4)
        ]
        ("FLAVOR MEMORY" as NSString).draw(at: CGPoint(x: 12, y: 10), withAttributes: headerAttrs)

        let center = CGPoint(x: 130, y: 135)
        let maxRadius: CGFloat = 90

        // Faint axis lines
        ctx.saveGState()
        ctx.setStrokeColor(UIColor.white.withAlphaComponent(0.12).cgColor)
        ctx.setLineWidth(0.5)
        for angle in axisAngles {
            ctx.move(to: center)
            ctx.addLine(to: CGPoint(
                x: center.x + maxRadius * cos(angle),
                y: center.y + maxRadius * sin(angle)
            ))
        }
        ctx.strokePath()
        ctx.restoreGState()

        // Outer pentagon (full scale, muted)
        let outerPath = pentagonPath(center: center, values: [1, 1, 1, 1, 1], maxRadius: maxRadius)
        UIColor.white.withAlphaComponent(0.10).setStroke()
        outerPath.lineWidth = 0.5
        outerPath.stroke()

        // Mid-scale ring
        let midPath = pentagonPath(center: center, values: [0.5, 0.5, 0.5, 0.5, 0.5], maxRadius: maxRadius)
        UIColor.white.withAlphaComponent(0.06).setStroke()
        midPath.lineWidth = 0.5
        midPath.stroke()

        // Personal best polygon: white 0.15 fill, 1pt white 0.3 stroke
        let bestValues = profileValues(personalBest)
        let bestPath = pentagonPath(center: center, values: bestValues, maxRadius: maxRadius)
        UIColor.white.withAlphaComponent(0.15).setFill()
        bestPath.fill()
        UIColor.white.withAlphaComponent(0.30).setStroke()
        bestPath.lineWidth = 1
        bestPath.stroke()

        // Current polygon: accent 0.25 fill, 1.5pt accent stroke
        let currentValues = profileValues(current)
        let currentPath = pentagonPath(center: center, values: currentValues, maxRadius: maxRadius)
        accent.withAlphaComponent(0.25).setFill()
        currentPath.fill()
        accent.setStroke()
        currentPath.lineWidth = 1.5
        currentPath.stroke()

        // Axis labels at tips
        let labelFont = UIFont.monospacedSystemFont(ofSize: 6, weight: .regular)
        let labelAttrs: [NSAttributedString.Key: Any] = [
            .font: labelFont,
            .foregroundColor: UIColor.white.withAlphaComponent(0.45)
        ]
        let labelPad: CGFloat = 12
        for (i, angle) in axisAngles.enumerated() {
            let dist = maxRadius + labelPad
            let lx = center.x + dist * cos(angle)
            let ly = center.y + dist * sin(angle)
            let str = axisLabels[i] as NSString
            let size = str.size(withAttributes: labelAttrs)
            str.draw(in: CGRect(x: lx - size.width / 2, y: ly - size.height / 2,
                                width: size.width, height: size.height),
                     withAttributes: labelAttrs)
        }

        // Legend: "TODAY" (accent) and "MY BEST" (muted white) bottom-right
        let legendY: CGFloat = rect.height - 24
        let legendX: CGFloat = rect.width - 90

        let todayAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .medium),
            .foregroundColor: accent
        ]
        let bestAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .medium),
            .foregroundColor: UIColor.white.withAlphaComponent(0.4)
        ]

        // TODAY dot + label
        ctx.saveGState()
        ctx.setFillColor(accent.cgColor)
        ctx.fillEllipse(in: CGRect(x: legendX, y: legendY + 2, width: 6, height: 6))
        ctx.restoreGState()
        ("TODAY" as NSString).draw(at: CGPoint(x: legendX + 10, y: legendY), withAttributes: todayAttrs)

        // MY BEST dot + label
        let bestLegendY = legendY + 13
        ctx.saveGState()
        ctx.setFillColor(UIColor.white.withAlphaComponent(0.35).cgColor)
        ctx.fillEllipse(in: CGRect(x: legendX, y: bestLegendY + 2, width: 6, height: 6))
        ctx.restoreGState()
        ("MY BEST" as NSString).draw(at: CGPoint(x: legendX + 10, y: bestLegendY), withAttributes: bestAttrs)
    }

    // MARK: - Helpers

    private func profileValues(_ p: FlavorProfile) -> [CGFloat] {
        return [p.sweetness, p.acidity, p.aroma, p.texture, p.intensity].map {
            CGFloat(min(max($0, 0), 10)) / 10
        }
    }

    private func pentagonPath(center: CGPoint, values: [CGFloat], maxRadius: CGFloat) -> UIBezierPath {
        let path = UIBezierPath()
        for (i, angle) in axisAngles.enumerated() {
            let r = maxRadius * values[i]
            let pt = CGPoint(x: center.x + r * cos(angle), y: center.y + r * sin(angle))
            if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
        }
        path.close()
        return path
    }
}
