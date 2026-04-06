// ARFermentationCardView.swift
// Horizontal fill bars showing fermentation potential for jam, wine, coulis, and vinegar.
// Renders at 280×110 pt for use as an SCNPlane texture.

import UIKit

class ARFermentationCardView: UIView {

    private let jam: Int
    private let wine: Int
    private let coulis: Int
    private let vinegar: Int

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)

    init(jam: Int, wine: Int, coulis: Int, vinegar: Int) {
        self.jam     = min(max(jam,     0), 100)
        self.wine    = min(max(wine,    0), 100)
        self.coulis  = min(max(coulis,  0), 100)
        self.vinegar = min(max(vinegar, 0), 100)
        super.init(frame: CGRect(x: 0, y: 0, width: 280, height: 110))
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
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
        ("FERMENTATION POTENTIAL" as NSString).draw(at: CGPoint(x: 12, y: 10), withAttributes: headerAttrs)

        let rows: [(String, Int)] = [
            ("JAM",     jam),
            ("WINE",    wine),
            ("COULIS",  coulis),
            ("VINEGAR", vinegar),
        ]

        // Layout
        let labelColW: CGFloat  = 58
        let barColW: CGFloat    = 158
        let scoreColW: CGFloat  = 40
        let rowH: CGFloat       = 20
        let rowGap: CGFloat     = 6
        let startX: CGFloat     = 12
        let startY: CGFloat     = 28
        let barH: CGFloat       = 6

        let labelAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.4)
        ]
        let scoreAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .medium),
            .foregroundColor: accent
        ]

        for (i, row) in rows.enumerated() {
            let (label, score) = row
            let y = startY + CGFloat(i) * (rowH + rowGap)
            let barY = y + (rowH - barH) / 2

            // Label
            (label as NSString).draw(at: CGPoint(x: startX, y: y + 2), withAttributes: labelAttrs)

            // Bar track
            let trackRect = CGRect(x: startX + labelColW, y: barY, width: barColW, height: barH)
            let trackPath = UIBezierPath(roundedRect: trackRect, cornerRadius: 3)
            UIColor.white.withAlphaComponent(0.12).setFill()
            trackPath.fill()

            // Bar fill
            let fillW = barColW * CGFloat(score) / 100
            if fillW > 0 {
                let fillRect = CGRect(x: startX + labelColW, y: barY, width: fillW, height: barH)
                let fillPath = UIBezierPath(roundedRect: fillRect, cornerRadius: 3)
                accent.setFill()
                fillPath.fill()
            }

            // Score label
            let scoreStr = "\(score)%" as NSString
            let scoreSize = scoreStr.size(withAttributes: scoreAttrs)
            let scoreX = startX + labelColW + barColW + (scoreColW - scoreSize.width)
            scoreStr.draw(at: CGPoint(x: scoreX, y: y + 2), withAttributes: scoreAttrs)
        }
    }
}
