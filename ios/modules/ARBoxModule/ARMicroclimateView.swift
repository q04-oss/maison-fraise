// ARMicroclimateView.swift
// Terrain silhouette and wind compass showing growing microclimate conditions.
// Renders at 280×120 pt for use as an SCNPlane texture.

import UIKit

class ARMicroclimateView: UIView {

    private let terrainType: String
    private let prevailingWind: String

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)
    private let terrainFill = UIColor(red: 0.10, green: 0.25, blue: 0.10, alpha: 0.80)

    init(terrainType: String, prevailingWind: String) {
        self.terrainType    = terrainType
        self.prevailingWind = prevailingWind
        super.init(frame: CGRect(x: 0, y: 0, width: 280, height: 120))
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
        ("MICROCLIMATE" as NSString).draw(at: CGPoint(x: 12, y: 8), withAttributes: headerAttrs)

        // Terrain occupies bottom 40% of rect (y from 72 to 120)
        let terrainTopY: CGFloat = rect.height * 0.60
        let terrainPath = buildTerrainPath(rect: rect, topY: terrainTopY)

        // Fog band for valley/coastal (8pt tall, white 0.05 alpha)
        if terrainType == "valley" || terrainType == "coastal" {
            let fogRect = CGRect(x: 0, y: terrainTopY - 8, width: rect.width, height: 8)
            let fogPath = UIBezierPath(rect: fogRect)
            UIColor.white.withAlphaComponent(0.05).setFill()
            fogPath.fill()
        }

        // Terrain fill (clipped to pill shape)
        ctx.saveGState()
        ctx.addPath(pill.cgPath)
        ctx.clip()
        terrainFill.setFill()
        terrainPath.fill()
        ctx.restoreGState()

        // Terrain label (bottom-left area)
        let terrainLabel: String
        switch terrainType {
        case "valley":   terrainLabel = "VALLEY FLOOR"
        case "hillside": terrainLabel = "HILLSIDE"
        case "plateau":  terrainLabel = "PLATEAU"
        case "coastal":  terrainLabel = "COASTAL"
        default:         terrainLabel = terrainType.uppercased()
        }
        let terrainLabelAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.45)
        ]
        (terrainLabel as NSString).draw(at: CGPoint(x: 14, y: terrainTopY + 4),
                                        withAttributes: terrainLabelAttrs)

        // Wind compass (top-right, circle 20pt diameter)
        drawWindCompass(ctx: ctx, rect: rect)
    }

    // MARK: - Terrain Path

    private func buildTerrainPath(rect: CGRect, topY: CGFloat) -> UIBezierPath {
        let w = rect.width
        let h = rect.height
        let path = UIBezierPath()

        switch terrainType {
        case "valley":
            // U-shape: high on sides, dips in center
            path.move(to: CGPoint(x: 0, y: topY - 18))
            path.addCurve(
                to:            CGPoint(x: w / 2, y: topY + 10),
                controlPoint1: CGPoint(x: w * 0.25, y: topY + 14),
                controlPoint2: CGPoint(x: w * 0.40, y: topY + 14)
            )
            path.addCurve(
                to:            CGPoint(x: w, y: topY - 18),
                controlPoint1: CGPoint(x: w * 0.60, y: topY + 14),
                controlPoint2: CGPoint(x: w * 0.75, y: topY + 14)
            )
            path.addLine(to: CGPoint(x: w, y: h))
            path.addLine(to: CGPoint(x: 0, y: h))
            path.close()

        case "hillside":
            // Ascending slope left to right
            path.move(to: CGPoint(x: 0, y: topY + 12))
            path.addLine(to: CGPoint(x: w, y: topY - 20))
            path.addLine(to: CGPoint(x: w, y: h))
            path.addLine(to: CGPoint(x: 0, y: h))
            path.close()

        case "plateau":
            // Flat top with steep sides
            path.move(to: CGPoint(x: 0, y: topY + 10))
            path.addLine(to: CGPoint(x: w * 0.15, y: topY - 5))
            path.addLine(to: CGPoint(x: w * 0.85, y: topY - 5))
            path.addLine(to: CGPoint(x: w, y: topY + 10))
            path.addLine(to: CGPoint(x: w, y: h))
            path.addLine(to: CGPoint(x: 0, y: h))
            path.close()

        case "coastal":
            // Flat left, wavy right edge for water
            path.move(to: CGPoint(x: 0, y: topY))
            path.addLine(to: CGPoint(x: w * 0.55, y: topY))
            // Wavy edge
            path.addCurve(
                to:            CGPoint(x: w * 0.70, y: topY + 8),
                controlPoint1: CGPoint(x: w * 0.60, y: topY - 6),
                controlPoint2: CGPoint(x: w * 0.65, y: topY + 8)
            )
            path.addCurve(
                to:            CGPoint(x: w * 0.85, y: topY + 2),
                controlPoint1: CGPoint(x: w * 0.75, y: topY + 8),
                controlPoint2: CGPoint(x: w * 0.80, y: topY - 4)
            )
            path.addCurve(
                to:            CGPoint(x: w, y: topY + 10),
                controlPoint1: CGPoint(x: w * 0.90, y: topY + 10),
                controlPoint2: CGPoint(x: w * 0.95, y: topY + 6)
            )
            path.addLine(to: CGPoint(x: w, y: h))
            path.addLine(to: CGPoint(x: 0, y: h))
            path.close()

        default:
            // Flat fallback
            path.move(to: CGPoint(x: 0, y: topY))
            path.addLine(to: CGPoint(x: rect.width, y: topY))
            path.addLine(to: CGPoint(x: rect.width, y: h))
            path.addLine(to: CGPoint(x: 0, y: h))
            path.close()
        }

        return path
    }

    // MARK: - Wind Compass

    private func drawWindCompass(ctx: CGContext, rect: CGRect) {
        // Wind direction angle mapping (degrees, clockwise from East in standard math,
        // but we want the arrow to point in screen direction)
        // N = up = 270° in standard trig (pointing up on screen)
        let windAngles: [String: CGFloat] = [
            "N":  270, "NE": 315, "E": 0, "SE": 45,
            "S":  90,  "SW": 135, "W": 180, "NW": 225,
        ]
        let angleDeg = windAngles[prevailingWind] ?? 270
        let angle = angleDeg * .pi / 180

        let compassCX: CGFloat = rect.width - 22
        let compassCY: CGFloat = 26
        let compassR:  CGFloat = 10

        // Outer circle
        ctx.saveGState()
        ctx.setStrokeColor(UIColor.white.withAlphaComponent(0.25).cgColor)
        ctx.setLineWidth(1)
        ctx.strokeEllipse(in: CGRect(x: compassCX - compassR, y: compassCY - compassR,
                                     width: compassR * 2, height: compassR * 2))
        ctx.restoreGState()

        // Arrow shaft
        let arrowLen = compassR - 2
        let arrowEndX = compassCX + arrowLen * cos(angle)
        let arrowEndY = compassCY + arrowLen * sin(angle)
        ctx.saveGState()
        ctx.setStrokeColor(UIColor.white.withAlphaComponent(0.8).cgColor)
        ctx.setLineWidth(1)
        ctx.move(to:    CGPoint(x: compassCX, y: compassCY))
        ctx.addLine(to: CGPoint(x: arrowEndX, y: arrowEndY))
        ctx.strokePath()
        ctx.restoreGState()

        // Arrowhead (accent color, small triangle)
        let headLen:  CGFloat = 5
        let headAngle: CGFloat = 0.45
        let hx1 = arrowEndX - headLen * cos(angle - headAngle)
        let hy1 = arrowEndY - headLen * sin(angle - headAngle)
        let hx2 = arrowEndX - headLen * cos(angle + headAngle)
        let hy2 = arrowEndY - headLen * sin(angle + headAngle)

        ctx.saveGState()
        let headPath = UIBezierPath()
        headPath.move(to:    CGPoint(x: arrowEndX, y: arrowEndY))
        headPath.addLine(to: CGPoint(x: hx1, y: hy1))
        headPath.addLine(to: CGPoint(x: hx2, y: hy2))
        headPath.close()
        accent.setFill()
        headPath.fill()
        ctx.restoreGState()

        // Wind label
        let windAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 6, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.4)
        ]
        let windStr = "WIND: \(prevailingWind)" as NSString
        let windSize = windStr.size(withAttributes: windAttrs)
        windStr.draw(at: CGPoint(x: compassCX - windSize.width / 2, y: compassCY + compassR + 3),
                     withAttributes: windAttrs)
    }
}
