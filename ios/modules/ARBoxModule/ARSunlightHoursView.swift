// ARSunlightHoursView.swift
// ARBoxModule — Maison Fraise
//
// draw(_:) view rendered at 260×80 pt. Displays sunlight hours data
// as a horizontal bar with quality classification label.
// No storyboards.

import UIKit

final class ARSunlightHoursView: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)

    private let muted  = UIColor(white: 1, alpha: 0.45)
    private let yellow = UIColor(red: 0.99, green: 0.85, blue: 0.20, alpha: 0.9)
    private let green  = UIColor(red: 0.18, green: 0.72, blue: 0.36, alpha: 1)

    // MARK: - Data

    private let sunlightHours: Double

    // MARK: - Init

    init(sunlightHours: Double) {
        self.sunlightHours = sunlightHours
        super.init(frame: CGRect(x: 0, y: 0, width: 260, height: 80))
        backgroundColor = .clear
        isOpaque = false
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Drawing

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        // Background pill
        let pillPath = UIBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: 16)
        bg.setFill()
        pillPath.fill()

        // --- Header: "SUNLIGHT HOURS" ---
        let headerFont = UIFont.monospacedSystemFont(ofSize: 7, weight: .regular)
        let headerAttrs: [NSAttributedString.Key: Any] = [
            .font: headerFont,
            .foregroundColor: muted
        ]
        let headerStr = "SUNLIGHT HOURS"
        let headerSize = headerStr.size(withAttributes: headerAttrs)
        let headerOrigin = CGPoint(x: rect.midX - headerSize.width / 2, y: 9)
        headerStr.draw(at: headerOrigin, withAttributes: headerAttrs)

        // --- Sun emoji ---
        let sunFont = UIFont.systemFont(ofSize: 14)
        let sunAttrs: [NSAttributedString.Key: Any] = [.font: sunFont]
        let sunStr = "☀️"
        let sunSize = sunStr.size(withAttributes: sunAttrs)
        let sunOrigin = CGPoint(x: 12, y: 26)
        sunStr.draw(at: sunOrigin, withAttributes: sunAttrs)

        // --- Bar geometry ---
        let barLeft: CGFloat   = 12 + sunSize.width + 8
        let barRight: CGFloat  = rect.width - 12
        let barY: CGFloat      = 30
        let barHeight: CGFloat = 8
        let barWidth           = barRight - barLeft

        // Track
        let trackRect = CGRect(x: barLeft, y: barY, width: barWidth, height: barHeight)
        let trackPath = UIBezierPath(roundedRect: trackRect, cornerRadius: 4)
        muted.withAlphaComponent(0.2).setFill()
        trackPath.fill()

        // Fill
        let fraction = min(max(sunlightHours / 14.0, 0), 1)
        let fillWidth = barWidth * CGFloat(fraction)
        if fillWidth > 0 {
            let fillRect = CGRect(x: barLeft, y: barY, width: fillWidth, height: barHeight)
            let fillPath = UIBezierPath(roundedRect: fillRect, cornerRadius: 4)
            yellow.setFill()
            fillPath.fill()
        }

        // --- Value label: "Xh per day" ---
        let valueFont = UIFont.boldSystemFont(ofSize: 11)
        let valueAttrs: [NSAttributedString.Key: Any] = [
            .font: valueFont,
            .foregroundColor: UIColor.white
        ]
        let valueStr = "\(Int(sunlightHours))h per day"
        let valueLabelY: CGFloat = 21
        let valueSize = valueStr.size(withAttributes: valueAttrs)
        // Right-align inside bar area
        let valueOrigin = CGPoint(x: barRight - valueSize.width, y: valueLabelY)
        valueStr.draw(at: valueOrigin, withAttributes: valueAttrs)

        // --- Quality label ---
        let qualityFont = UIFont.monospacedSystemFont(ofSize: 7, weight: .bold)
        let qualityColor: UIColor
        let qualityStr: String
        if sunlightHours < 6 {
            qualityColor = muted
            qualityStr   = "LOW LIGHT"
        } else if sunlightHours <= 9 {
            qualityColor = accent
            qualityStr   = "GOOD LIGHT"
        } else {
            qualityColor = green
            qualityStr   = "OPTIMAL"
        }
        let qualityAttrs: [NSAttributedString.Key: Any] = [
            .font: qualityFont,
            .foregroundColor: qualityColor
        ]
        let qualitySize   = qualityStr.size(withAttributes: qualityAttrs)
        let qualityOrigin = CGPoint(x: barLeft, y: barY + barHeight + 6)
        qualityStr.draw(at: qualityOrigin, withAttributes: qualityAttrs)

        ctx.flush()
    }
}
