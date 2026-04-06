/// ARCarbonFootprintView.swift
/// A draw(_:) view displaying the carbon footprint of a strawberry box, including
/// CO₂ grams, tree equivalent, and optional offset program indicator.
/// Renders to 280×110 pt.

import UIKit

class ARCarbonFootprintView: UIView {

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)

    private let co2Grams: Int
    private let offsetProgram: String?

    init(co2Grams: Int, offsetProgram: String?) {
        self.co2Grams = co2Grams
        self.offsetProgram = offsetProgram
        super.init(frame: CGRect(x: 0, y: 0, width: 280, height: 110))
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        // Background pill
        let pillPath = UIBezierPath(roundedRect: rect.insetBy(dx: 2, dy: 2), cornerRadius: 14)
        ctx.setFillColor(bg.cgColor)
        ctx.addPath(pillPath.cgPath)
        ctx.fillPath()

        let mutedWhite = UIColor.white.withAlphaComponent(0.4)
        let isOffset = offsetProgram != nil

        // Header
        let headerAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: mutedWhite
        ]
        ("CARBON FOOTPRINT" as NSString).draw(at: CGPoint(x: 12, y: 8), withAttributes: headerAttrs)

        // Left half: CO₂ number
        let co2Text = "\(co2Grams)g CO₂"
        let co2Attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 24, weight: .bold),
            .foregroundColor: UIColor.white
        ]
        let co2Str = co2Text as NSString
        let co2Size = co2Str.size(withAttributes: co2Attrs)
        let leftCenterX = rect.width / 4
        co2Str.draw(at: CGPoint(x: leftCenterX - co2Size.width / 2,
                                 y: rect.midY - co2Size.height / 2 - 4),
                    withAttributes: co2Attrs)

        // Right half: tree equivalent
        // co2Grams / 21000.0 * 365 trees per year
        let treesPerYear = Double(co2Grams) / 21000.0 * 365.0
        let treeText = "🌱 ≈ \(String(format: "%.2f", treesPerYear)) trees/yr"
        let treeAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 10, weight: .regular),
            .foregroundColor: mutedWhite
        ]
        let treeStr = treeText as NSString
        let treeSize = treeStr.size(withAttributes: treeAttrs)
        let rightCenterX = rect.width * 3 / 4
        treeStr.draw(at: CGPoint(x: rightCenterX - treeSize.width / 2,
                                  y: rect.midY - treeSize.height / 2 - 4),
                     withAttributes: treeAttrs)

        // Offset program label
        if let program = offsetProgram {
            let offsetText = "✓  OFFSET: \(program)"
            let offsetAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 9, weight: .regular),
                .foregroundColor: accent
            ]
            let offsetStr = offsetText as NSString
            let offsetSize = offsetStr.size(withAttributes: offsetAttrs)
            offsetStr.draw(at: CGPoint(x: rect.midX - offsetSize.width / 2,
                                        y: rect.height - 20),
                           withAttributes: offsetAttrs)
        }

        // Bottom bar
        let barRect = CGRect(x: 14, y: rect.height - 7, width: rect.width - 28, height: 3)
        let barColor = isOffset
            ? UIColor(red: 0.18, green: 0.72, blue: 0.36, alpha: 0.85)
            : UIColor(red: 0.95, green: 0.65, blue: 0.15, alpha: 0.85)

        let barPath = UIBezierPath(roundedRect: barRect, cornerRadius: 1.5)
        ctx.setFillColor(barColor.cgColor)
        ctx.addPath(barPath.cgPath)
        ctx.fillPath()
    }
}
