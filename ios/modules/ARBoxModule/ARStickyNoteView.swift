// ARStickyNoteView.swift
// ARBoxModule — Maison Fraise
//
// draw(_:) view rendered to 220×160 pt for use as an SCNPlane texture.
// Mimics a physical sticky note with fold shadow, pin, author badge,
// body text, and relative timestamp. No storyboards.

import UIKit

final class ARStickyNoteView: UIView {

    // MARK: - Style (shared pattern, kept for consistency)

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)

    // MARK: - Note colors

    private static func noteUIColor(for colorName: String) -> UIColor {
        switch colorName {
        case "amber": return UIColor(red: 0.99, green: 0.85, blue: 0.20, alpha: 0.95)
        case "blue":  return UIColor(red: 0.25, green: 0.55, blue: 0.95, alpha: 0.95)
        case "green": return UIColor(red: 0.20, green: 0.75, blue: 0.40, alpha: 0.95)
        case "red":   return UIColor(red: 0.95, green: 0.25, blue: 0.20, alpha: 0.95)
        default:      return UIColor(red: 0.99, green: 0.85, blue: 0.20, alpha: 0.95)
        }
    }

    // MARK: - Data

    private let body:       String
    private let authorName: String
    private let noteColor:  String
    private let createdAt:  Date

    // MARK: - Init

    init(body: String, authorName: String, color: String, createdAt: Date) {
        self.body       = body
        self.authorName = authorName
        self.noteColor  = color
        self.createdAt  = createdAt
        super.init(frame: CGRect(x: 0, y: 0, width: 220, height: 160))
        backgroundColor = .clear
        isOpaque = false
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Drawing

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        let noteBase = ARStickyNoteView.noteUIColor(for: noteColor)
        let foldSize: CGFloat = 18

        // --- Background (full rect minus fold triangle) ---
        // Build a path that cuts the top-right corner for the fold
        let notePath = UIBezierPath()
        notePath.move(to: CGPoint(x: 0, y: 0))
        notePath.addLine(to: CGPoint(x: rect.width - foldSize, y: 0))
        notePath.addLine(to: CGPoint(x: rect.width, y: foldSize))
        notePath.addLine(to: CGPoint(x: rect.width, y: rect.height))
        notePath.addLine(to: CGPoint(x: 0, y: rect.height))
        notePath.close()

        noteBase.setFill()
        notePath.fill()

        // --- Fold shadow triangle ---
        // Slightly darker variant of the note color blended with black
        let foldColor = noteBase.blended(withFraction: 0.35, of: .black)
        let foldPath = UIBezierPath()
        foldPath.move(to: CGPoint(x: rect.width - foldSize, y: 0))
        foldPath.addLine(to: CGPoint(x: rect.width, y: foldSize))
        foldPath.addLine(to: CGPoint(x: rect.width - foldSize, y: foldSize))
        foldPath.close()
        foldColor.setFill()
        foldPath.fill()

        // Light crease line
        ctx.setStrokeColor(UIColor.white.withAlphaComponent(0.25).cgColor)
        ctx.setLineWidth(0.5)
        ctx.move(to: CGPoint(x: rect.width - foldSize, y: 0))
        ctx.addLine(to: CGPoint(x: rect.width - foldSize, y: foldSize))
        ctx.addLine(to: CGPoint(x: rect.width, y: foldSize))
        ctx.strokePath()

        // Dark text color for note surface
        let darkText = UIColor(red: 0.13, green: 0.12, blue: 0.11, alpha: 1)
        let mutedDark = darkText.withAlphaComponent(0.5)

        // --- Pin emoji ---
        let pinFont  = UIFont.systemFont(ofSize: 12)
        let pinAttrs: [NSAttributedString.Key: Any] = [.font: pinFont]
        "📌".draw(at: CGPoint(x: 8, y: 6), withAttributes: pinAttrs)

        // --- Author initial badge ---
        let initial = authorName.isEmpty ? "?" : String(authorName.prefix(1)).uppercased()
        let badgeSize: CGFloat = 20
        let badgeX = rect.width - foldSize - badgeSize - 4
        let badgeY: CGFloat = 4
        let badgeRect = CGRect(x: badgeX, y: badgeY, width: badgeSize, height: badgeSize)
        let badgePath = UIBezierPath(ovalIn: badgeRect)
        darkText.withAlphaComponent(0.25).setFill()
        badgePath.fill()

        let initialFont  = UIFont.boldSystemFont(ofSize: 10)
        let initialAttrs: [NSAttributedString.Key: Any] = [
            .font: initialFont,
            .foregroundColor: darkText
        ]
        let initialSize   = initial.size(withAttributes: initialAttrs)
        let initialOrigin = CGPoint(
            x: badgeRect.midX - initialSize.width / 2,
            y: badgeRect.midY - initialSize.height / 2
        )
        initial.draw(at: initialOrigin, withAttributes: initialAttrs)

        // --- Body text (3-line clipped) ---
        let bodyFont  = UIFont.systemFont(ofSize: 12)
        let bodyAttrs: [NSAttributedString.Key: Any] = [
            .font: bodyFont,
            .foregroundColor: darkText
        ]
        let bodyRect = CGRect(x: 10, y: 34, width: rect.width - 20, height: 88)
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.lineBreakMode = .byTruncatingTail
        paragraphStyle.maximumLineHeight = 18
        var clippedAttrs = bodyAttrs
        clippedAttrs[.paragraphStyle] = paragraphStyle

        // Clip to 3 lines: draw into a clipping region
        ctx.saveGState()
        ctx.clip(to: bodyRect)
        body.draw(in: bodyRect, withAttributes: clippedAttrs)
        ctx.restoreGState()

        // --- Timestamp ---
        let timestamp = relativeTimestamp(from: createdAt)
        let tsFont    = UIFont.systemFont(ofSize: 8)
        let tsAttrs: [NSAttributedString.Key: Any] = [
            .font: tsFont,
            .foregroundColor: mutedDark
        ]
        let tsSize   = timestamp.size(withAttributes: tsAttrs)
        let tsOrigin = CGPoint(x: rect.width - tsSize.width - 10, y: rect.height - tsSize.height - 8)
        timestamp.draw(at: tsOrigin, withAttributes: tsAttrs)

        ctx.flush()
    }

    // MARK: - Helpers

    private func relativeTimestamp(from date: Date) -> String {
        let elapsed = Date().timeIntervalSince(date)
        let hours   = Int(elapsed / 3600)
        let days    = Int(elapsed / 86400)
        if days >= 1 { return "\(days)d ago" }
        if hours >= 1 { return "\(hours)h ago" }
        return "just now"
    }
}

// MARK: - UIColor blend helper

private extension UIColor {
    /// Blends this color toward `other` by `fraction` (0 = self, 1 = other).
    func blended(withFraction fraction: CGFloat, of other: UIColor) -> UIColor {
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        other.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        return UIColor(
            red:   r1 + (r2 - r1) * fraction,
            green: g1 + (g2 - g1) * fraction,
            blue:  b1 + (b2 - b1) * fraction,
            alpha: a1 + (a2 - a1) * fraction
        )
    }
}
