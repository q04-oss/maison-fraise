// ARSugarAcidDialView.swift
// Half-circle gauge showing the balance between sugar (Brix) and acidity.
// Renders at 220×160 pt for use as an SCNPlane texture.

import UIKit

class ARSugarAcidDialView: UIView {

    private let brix: Double
    private let acidity: Double   // 0-10 scale

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)

    init(brix: Double, acidity: Double) {
        self.brix    = brix
        self.acidity = min(max(acidity, 0), 10)
        super.init(frame: CGRect(x: 0, y: 0, width: 220, height: 160))
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        // Background pill
        let pill = UIBezierPath(roundedRect: rect, cornerRadius: 18)
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
        ("BALANCE" as NSString).draw(at: CGPoint(x: 12, y: 10), withAttributes: headerAttrs)

        let center = CGPoint(x: rect.width / 2, y: 120)
        let radius: CGFloat = 70
        let arcWidth: CGFloat = 12

        // Half-circle arc: π to 2π (left = tart, right = sweet) in standard UIKit
        // In UIKit: π = left, 0 = right, arc from π to 0 going clockwise sweeps the top half
        // We want a bottom-up half circle: draw from .pi to 0, clockwise = top half
        // Actually for a "gauge" we want the flat side at bottom:
        // startAngle = π (left), endAngle = 0/2π (right), clockwise direction
        let arcStart: CGFloat = .pi
        let arcEnd: CGFloat   = 0

        // Zone colors: blue (tart), green (balanced), amber (sweet)
        // Draw three 60° arcs
        let zoneColors: [UIColor] = [
            UIColor(red: 0.31, green: 0.60, blue: 0.95, alpha: 1),  // tart - blue
            UIColor(red: 0.18, green: 0.72, blue: 0.36, alpha: 1),  // balanced - green
            accent                                                     // sweet - amber
        ]
        let sweepPerZone: CGFloat = .pi / 3

        ctx.saveGState()
        ctx.setLineWidth(arcWidth)
        ctx.setLineCap(.butt)
        for i in 0..<3 {
            let zStart = arcStart - CGFloat(i) * sweepPerZone
            let zEnd   = zStart - sweepPerZone
            let path = UIBezierPath(arcCenter: center, radius: radius,
                                    startAngle: zStart, endAngle: zEnd, clockwise: false)
            ctx.setStrokeColor(zoneColors[i].withAlphaComponent(0.75).cgColor)
            ctx.addPath(path.cgPath)
            ctx.strokePath()
        }
        ctx.restoreGState()

        // Track background (thin muted ring behind)
        ctx.saveGState()
        ctx.setStrokeColor(UIColor.white.withAlphaComponent(0.06).cgColor)
        ctx.setLineWidth(arcWidth + 2)
        ctx.setLineCap(.round)
        let trackPath = UIBezierPath(arcCenter: center, radius: radius,
                                     startAngle: arcStart, endAngle: arcEnd, clockwise: false)
        ctx.addPath(trackPath.cgPath)
        ctx.strokePath()
        ctx.restoreGState()

        // Re-draw zones on top
        ctx.saveGState()
        ctx.setLineWidth(arcWidth)
        ctx.setLineCap(.butt)
        for i in 0..<3 {
            let zStart = arcStart - CGFloat(i) * sweepPerZone
            let zEnd   = zStart - sweepPerZone
            let path = UIBezierPath(arcCenter: center, radius: radius,
                                    startAngle: zStart, endAngle: zEnd, clockwise: false)
            ctx.setStrokeColor(zoneColors[i].withAlphaComponent(0.75).cgColor)
            ctx.addPath(path.cgPath)
            ctx.strokePath()
        }
        ctx.restoreGState()

        // Needle angle calculation
        // ratio = (brix/20 + (1 - acidity/10)) / 2, clamp 0-1
        let rawRatio = (brix / 20.0 + (1.0 - acidity / 10.0)) / 2.0
        let ratio = CGFloat(min(max(rawRatio, 0), 1))
        // angle: 0 = left (π), 1 = right (0), so needleAngle = π - ratio * π = π(1 - ratio)
        let needleAngle = CGFloat.pi * (1.0 - ratio)

        let needleLen = radius - 4
        let needleEnd = CGPoint(
            x: center.x + needleLen * cos(needleAngle),
            y: center.y + needleLen * sin(needleAngle)
        )

        // Needle line
        ctx.saveGState()
        ctx.setStrokeColor(UIColor.white.withAlphaComponent(0.9).cgColor)
        ctx.setLineWidth(2)
        ctx.setLineCap(.round)
        ctx.move(to: center)
        ctx.addLine(to: needleEnd)
        ctx.strokePath()
        ctx.restoreGState()

        // Center pivot dot
        let pivotRect = CGRect(x: center.x - 4, y: center.y - 4, width: 8, height: 8)
        let pivotPath = UIBezierPath(ovalIn: pivotRect)
        UIColor.white.withAlphaComponent(0.8).setFill()
        pivotPath.fill()

        // Zone label below arc
        let zone: String
        if ratio < 0.333 {
            zone = "TART"
        } else if ratio < 0.667 {
            zone = "BALANCED"
        } else {
            zone = "SWEET-FORWARD"
        }
        let zoneAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .medium),
            .foregroundColor: UIColor.white.withAlphaComponent(0.85)
        ]
        let zoneStr = zone as NSString
        let zoneSize = zoneStr.size(withAttributes: zoneAttrs)
        zoneStr.draw(at: CGPoint(x: center.x - zoneSize.width / 2, y: center.y + 10),
                     withAttributes: zoneAttrs)

        // Axis labels: TART bottom-left, SWEET bottom-right
        let axisAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.35)
        ]
        ("TART" as NSString).draw(at: CGPoint(x: center.x - radius - 4, y: center.y + 6),
                                   withAttributes: axisAttrs)
        ("SWEET" as NSString).draw(at: CGPoint(x: center.x + radius - 24, y: center.y + 6),
                                    withAttributes: axisAttrs)
    }
}
