/// ARPhotosynthesisMeterView.swift
/// Renders a real-time solar irradiance gauge with cloud cover and UV index.
/// Size: 280×120 pt.

import UIKit

class ARPhotosynthesisMeterView: UIView {
    private let bg = UIColor(red: 0.06, green: 0.06, blue: 0.05, alpha: 0.92)
    private let accent = UIColor(red: 1.0, green: 0.88, blue: 0.2, alpha: 1)

    struct SolarData {
        let irradianceWm2: Int
        let cloudCoverPct: Int
        let uvIndex: Double
    }

    private let data: SolarData

    init(data: SolarData) {
        self.data = data
        super.init(frame: CGRect(x: 0, y: 0, width: 280, height: 120))
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        // Background pill
        let pill = UIBezierPath(roundedRect: rect.insetBy(dx: 2, dy: 2), cornerRadius: 14)
        ctx.setFillColor(bg.cgColor)
        ctx.addPath(pill.cgPath)
        ctx.fillPath()

        let mutedWhite = UIColor.white.withAlphaComponent(0.45)

        // Header
        let headerAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
            .foregroundColor: mutedWhite,
        ]
        ("PHOTOSYNTHESIS" as NSString).draw(at: CGPoint(x: 12, y: 9), withAttributes: headerAttrs)

        // Semi-circle gauge
        let gaugeCenter = CGPoint(x: rect.midX, y: rect.height - 20)
        let radius: CGFloat = 50
        let startAngle = CGFloat.pi          // 180° (left)
        let endAngle: CGFloat = 0             // 0° (right)

        // Track arc (dark)
        ctx.saveGState()
        ctx.setStrokeColor(UIColor.white.withAlphaComponent(0.12).cgColor)
        ctx.setLineWidth(8)
        ctx.setLineCap(.round)
        ctx.addArc(center: gaugeCenter, radius: radius, startAngle: startAngle, endAngle: endAngle, clockwise: false)
        ctx.strokePath()
        ctx.restoreGState()

        // Fill arc (yellow, proportional to irradiance 0–1000)
        let fraction = min(1.0, CGFloat(data.irradianceWm2) / 1000.0)
        let fillEnd = startAngle + fraction * (endAngle - startAngle + CGFloat.pi * 2).truncatingRemainder(dividingBy: CGFloat.pi * 2)
        // Simple: linear from π to 0 going counter-clockwise
        let fillAngle = startAngle - fraction * CGFloat.pi  // from π, sweep by -fraction*π gives arc going left→right

        ctx.saveGState()
        ctx.setStrokeColor(accent.withAlphaComponent(0.9).cgColor)
        ctx.setLineWidth(8)
        ctx.setLineCap(.round)
        ctx.addArc(center: gaugeCenter, radius: radius, startAngle: CGFloat.pi, endAngle: fillAngle, clockwise: true)
        ctx.strokePath()
        ctx.restoreGState()

        // Irradiance value in centre
        let valAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 13, weight: .semibold),
            .foregroundColor: UIColor.white,
        ]
        let valStr = "\(data.irradianceWm2) W/m²" as NSString
        let valSize = valStr.size(withAttributes: valAttrs)
        valStr.draw(at: CGPoint(x: rect.midX - valSize.width / 2, y: gaugeCenter.y - 22), withAttributes: valAttrs)

        // Cloud and UV below
        let subAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
            .foregroundColor: mutedWhite,
        ]
        let cloudStr = "☁ \(data.cloudCoverPct)%" as NSString
        let uvStr = "UV \(String(format: "%.1f", data.uvIndex))" as NSString
        cloudStr.draw(at: CGPoint(x: rect.midX - 52, y: gaugeCenter.y - 5), withAttributes: subAttrs)
        uvStr.draw(at: CGPoint(x: rect.midX + 16, y: gaugeCenter.y - 5), withAttributes: subAttrs)
    }
}
