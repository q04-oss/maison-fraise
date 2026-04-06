// ARCoverCropView.swift
// Shows the cover crop type with an emoji, display name, and subtitle.
// Renders at 280×70 pt for use as an SCNPlane texture.

import UIKit

class ARCoverCropView: UIView {

    private let coverCrop: String

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)

    private let cropMap: [String: (emoji: String, name: String)] = [
        "clover":     ("🍀", "CLOVER"),
        "rye":        ("🌾", "RYE GRASS"),
        "mustard":    ("🌼", "MUSTARD"),
        "wildflower": ("🌸", "WILDFLOWER MIX"),
        "legume":     ("🫘", "LEGUME MIX"),
    ]

    init(coverCrop: String) {
        self.coverCrop = coverCrop
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
        ("COVER CROP" as NSString).draw(at: CGPoint(x: 12, y: 8), withAttributes: headerAttrs)

        // Resolve crop info
        let info = cropMap[coverCrop] ?? ("🌿", "COVER CROP")

        // Emoji (32pt) in left area
        let emojiAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 32)
        ]
        let emojiStr = info.emoji as NSString
        let emojiSize = emojiStr.size(withAttributes: emojiAttrs)
        let emojiX: CGFloat = 14
        let emojiY: CGFloat = (rect.height - emojiSize.height) / 2 + 2
        emojiStr.draw(at: CGPoint(x: emojiX, y: emojiY), withAttributes: emojiAttrs)

        // Display name
        let nameX: CGFloat = emojiX + emojiSize.width + 10
        let nameAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 13, weight: .medium),
            .foregroundColor: UIColor.white
        ]
        let nameStr = info.name as NSString
        let nameSize = nameStr.size(withAttributes: nameAttrs)
        nameStr.draw(at: CGPoint(x: nameX, y: rect.height / 2 - nameSize.height - 1),
                     withAttributes: nameAttrs)

        // Subtitle
        let subtitleAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.4)
        ]
        ("GROWN BETWEEN ROWS" as NSString).draw(
            at: CGPoint(x: nameX, y: rect.height / 2 + 2),
            withAttributes: subtitleAttrs
        )

        // Ground line
        ctx.saveGState()
        ctx.setStrokeColor(UIColor.white.withAlphaComponent(0.2).cgColor)
        ctx.setLineWidth(1)
        ctx.move(to:    CGPoint(x: 12,              y: 62))
        ctx.addLine(to: CGPoint(x: rect.width - 12, y: 62))
        ctx.strokePath()
        ctx.restoreGState()
    }
}
