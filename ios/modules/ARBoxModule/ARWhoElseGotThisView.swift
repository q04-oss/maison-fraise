// ARWhoElseGotThisView.swift
// ARBoxModule — Maison Fraise
//
// draw(_:) strip showing avatar circles for other members who received the
// same batch. Circles overlap by 6pt; truncates to "+N" beyond 8.
// No storyboards.

import UIKit

final class ARWhoElseGotThisView: UIView {

    // MARK: - Style

    private let bg    = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)
    private let muted = UIColor.white.withAlphaComponent(0.4)

    // MARK: - Data

    private let members: [(initial: String, colorHex: String)]

    // MARK: - Init

    init(members: [(initial: String, colorHex: String)]) {
        self.members = members
        super.init(frame: CGRect(x: 0, y: 0, width: 280, height: 70))
        backgroundColor = .clear
        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 280),
            heightAnchor.constraint(equalToConstant: 70)
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Drawing

    override func draw(_ rect: CGRect) {
        // Background pill
        let pillPath = UIBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: 18)
        bg.setFill()
        pillPath.fill()

        // Header label
        let headerAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: muted
        ]
        ("ALSO IN YOUR BATCH:" as NSString).draw(at: CGPoint(x: 12, y: 8), withAttributes: headerAttrs)

        let maxVisible  = 8
        let circleDiam: CGFloat = 32
        let advance: CGFloat    = 26   // overlap = 6pt
        let circleY: CGFloat    = 48 - circleDiam / 2
        var cursorX: CGFloat    = 12
        let displayed           = min(members.count, maxVisible)

        for i in 0..<displayed {
            let member = members[i]
            let circleRect = CGRect(x: cursorX, y: circleY, width: circleDiam, height: circleDiam)

            // Fill
            let fillColor = parseHexColor(member.colorHex)
            fillColor.setFill()
            UIBezierPath(ovalIn: circleRect).fill()

            // White border
            UIColor.white.setStroke()
            let borderPath      = UIBezierPath(ovalIn: circleRect.insetBy(dx: 0.5, dy: 0.5))
            borderPath.lineWidth = 1
            borderPath.stroke()

            // Initial
            let initAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 11, weight: .bold),
                .foregroundColor: UIColor.white
            ]
            let initial    = String(member.initial.prefix(1)).uppercased() as NSString
            let textSize   = initial.size(withAttributes: initAttrs)
            let textOrigin = CGPoint(
                x: circleRect.midX - textSize.width / 2,
                y: circleRect.midY - textSize.height / 2
            )
            initial.draw(at: textOrigin, withAttributes: initAttrs)

            cursorX += advance
        }

        // Overflow count
        let overflow = members.count - maxVisible
        if overflow > 0 {
            let overflowAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 10, weight: .regular),
                .foregroundColor: muted
            ]
            let overflowStr = "+\(overflow)" as NSString
            let size        = overflowStr.size(withAttributes: overflowAttrs)
            overflowStr.draw(
                at: CGPoint(x: cursorX + 4, y: 48 - size.height / 2),
                withAttributes: overflowAttrs
            )
        }
    }

    // MARK: - Helpers

    private func parseHexColor(_ hex: String) -> UIColor {
        var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("#") { cleaned = String(cleaned.dropFirst()) }
        guard cleaned.count == 6, let value = UInt64(cleaned, radix: 16) else {
            return UIColor(white: 0.5, alpha: 1)
        }
        let r = CGFloat((value & 0xFF0000) >> 16) / 255
        let g = CGFloat((value & 0x00FF00) >> 8)  / 255
        let b = CGFloat( value & 0x0000FF)         / 255
        return UIColor(red: r, green: g, blue: b, alpha: 1)
    }
}
