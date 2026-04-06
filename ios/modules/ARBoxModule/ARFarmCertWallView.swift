// ARFarmCertWallView.swift
// Row of certification badges (organic, biodynamic, fair_trade, rainforest_alliance, gap).
// Renders at 300×90 pt for use as an SCNPlane texture.

import UIKit

class ARFarmCertWallView: UIView {

    private let certifications: [String]

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)
    private let mutedGold = UIColor(red: 0.7, green: 0.6, blue: 0.3, alpha: 0.6)

    private let certMap: [String: (emoji: String, label: String)] = [
        "organic":             ("🌱", "ORGANIC"),
        "biodynamic":          ("🌙", "BIODYNAMIC"),
        "fair_trade":          ("🤝", "FAIR TRADE"),
        "rainforest_alliance": ("🌲", "RAINFOREST"),
        "gap":                 ("✓",  "GAP"),
    ]

    init(certifications: [String]) {
        self.certifications = certifications
        super.init(frame: CGRect(x: 0, y: 0, width: 300, height: 90))
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
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
        ("CERTIFIED" as NSString).draw(at: CGPoint(x: 12, y: 8), withAttributes: headerAttrs)

        // Empty state
        if certifications.isEmpty {
            let emptyAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 9, weight: .regular),
                .foregroundColor: UIColor.white.withAlphaComponent(0.35)
            ]
            let str = "NO CERTIFICATIONS" as NSString
            let size = str.size(withAttributes: emptyAttrs)
            str.draw(at: CGPoint(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2),
                     withAttributes: emptyAttrs)
            return
        }

        // Badge dimensions
        let badgeW: CGFloat  = 52
        let badgeH: CGFloat  = 52
        let badgeGap: CGFloat = 10
        let startX: CGFloat  = 12
        let startY: CGFloat  = 26

        let emojiFont = UIFont.systemFont(ofSize: 18)
        let emojiAttrs: [NSAttributedString.Key: Any] = [.font: emojiFont]

        let sublabelAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 6, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.4)
        ]

        // Gap cert uses a text symbol, needs consistent font
        let checkAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 18, weight: .medium),
            .foregroundColor: UIColor.white.withAlphaComponent(0.85)
        ]

        for (i, cert) in certifications.prefix(5).enumerated() {
            guard let info = certMap[cert] else { continue }

            let bx = startX + CGFloat(i) * (badgeW + badgeGap)
            let by = startY

            // Badge background
            let badgeRect = CGRect(x: bx, y: by, width: badgeW, height: badgeH)
            let badgePath = UIBezierPath(roundedRect: badgeRect, cornerRadius: 12)
            UIColor.white.withAlphaComponent(0.06).setFill()
            badgePath.fill()
            mutedGold.setStroke()
            badgePath.lineWidth = 1
            badgePath.stroke()

            // Emoji or symbol centered in top portion of badge
            let symbolStr = info.emoji as NSString
            let attrs: [NSAttributedString.Key: Any] = cert == "gap" ? checkAttrs : emojiAttrs
            let symSize = symbolStr.size(withAttributes: attrs)
            let symX = bx + (badgeW - symSize.width) / 2
            let symY = by + 8
            symbolStr.draw(at: CGPoint(x: symX, y: symY), withAttributes: attrs)

            // Label below emoji
            let labelStr = info.label as NSString
            let labelSize = labelStr.size(withAttributes: sublabelAttrs)
            let labelX = bx + (badgeW - labelSize.width) / 2
            labelStr.draw(at: CGPoint(x: labelX, y: by + badgeH - labelSize.height - 6),
                          withAttributes: sublabelAttrs)
        }
    }
}
