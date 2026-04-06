// ARPigmentSpectrumView.swift
// Color gradient strip showing strawberry pigment hue with a position marker.
// Renders at 280×70 pt for use as an SCNPlane texture.

import UIKit

class ARPigmentSpectrumView: UIView {

    private let hueValue: Int

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)

    init(hueValue: Int) {
        self.hueValue = hueValue
        super.init(frame: CGRect(x: 0, y: 0, width: 280, height: 70))
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        // Background pill
        let pill = UIBezierPath(roundedRect: rect, cornerRadius: 16)
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
        ("PIGMENT" as NSString).draw(at: CGPoint(x: 12, y: 8), withAttributes: headerAttrs)

        // Hue value top-right
        let hueAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .medium),
            .foregroundColor: accent
        ]
        let hueStr = "\(hueValue)°" as NSString
        let hueSize = hueStr.size(withAttributes: hueAttrs)
        hueStr.draw(at: CGPoint(x: rect.width - hueSize.width - 12, y: 8), withAttributes: hueAttrs)

        // Gradient strip
        let stripPad: CGFloat = 12
        let stripX: CGFloat   = stripPad
        let stripY: CGFloat   = 24
        let stripW: CGFloat   = rect.width - stripPad * 2
        let stripH: CGFloat   = 24
        let stripRect = CGRect(x: stripX, y: stripY, width: stripW, height: stripH)

        // Clip to rounded rect
        ctx.saveGState()
        let clipPath = UIBezierPath(roundedRect: stripRect, cornerRadius: 4)
        ctx.addPath(clipPath.cgPath)
        ctx.clip()

        // Gradient: pale pink → deep crimson
        let paleColor  = UIColor(hue: 350/360.0, saturation: 0.25, brightness: 1.0, alpha: 1.0)
        let deepColor  = UIColor(hue: 345/360.0, saturation: 1.00, brightness: 0.6, alpha: 1.0)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let gradColors = [paleColor.cgColor, deepColor.cgColor] as CFArray
        let locs: [CGFloat] = [0.0, 1.0]
        if let gradient = CGGradient(colorsSpace: colorSpace, colors: gradColors, locations: locs) {
            ctx.drawLinearGradient(gradient,
                                   start: CGPoint(x: stripX, y: stripY),
                                   end:   CGPoint(x: stripX + stripW, y: stripY),
                                   options: [])
        }
        ctx.restoreGState()

        // Marker: vertical line at hue position
        // Range 330-360 maps to 0-stripW; clamp outside range proportionally
        let clampedHue = CGFloat(min(max(hueValue, 330), 360))
        let markerT    = (clampedHue - 330) / 30
        let markerX    = stripX + markerT * stripW

        ctx.saveGState()
        ctx.setStrokeColor(UIColor.white.withAlphaComponent(0.9).cgColor)
        ctx.setLineWidth(2)
        ctx.move(to: CGPoint(x: markerX, y: stripY - 2))
        ctx.addLine(to: CGPoint(x: markerX, y: stripY + stripH + 2))
        ctx.strokePath()
        ctx.restoreGState()

        // Bottom labels
        let bottomAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.35)
        ]
        ("PALE" as NSString).draw(at: CGPoint(x: stripX, y: stripY + stripH + 5), withAttributes: bottomAttrs)
        let deepStr = "DEEP" as NSString
        let deepSize = deepStr.size(withAttributes: bottomAttrs)
        deepStr.draw(at: CGPoint(x: stripX + stripW - deepSize.width, y: stripY + stripH + 5),
                     withAttributes: bottomAttrs)
    }
}
