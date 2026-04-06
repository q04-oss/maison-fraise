// ARMemoryLaneView.swift
// ARBoxModule — Maison Fraise
//
// draw(_:) panel recalling the user's last encounter with this product:
// relative date, star rating, and a tasting note snippet.
// No storyboards.

import UIKit

final class ARMemoryLaneView: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted  = UIColor.white.withAlphaComponent(0.4)

    // MARK: - Data

    private let lastDate: Date
    private let rating: Int
    private let note: String?

    // MARK: - Init

    init(lastDate: Date, rating: Int, note: String?) {
        self.lastDate = lastDate
        self.rating   = max(0, min(5, rating))
        self.note     = note
        super.init(frame: CGRect(x: 0, y: 0, width: 270, height: 110))
        backgroundColor = .clear
        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 270),
            heightAnchor.constraint(equalToConstant: 110)
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Drawing

    override func draw(_ rect: CGRect) {
        // Background pill
        let pillPath = UIBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: 18)
        bg.setFill()
        pillPath.fill()

        // --- Header row ---
        let headerAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: muted
        ]
        let headerStr = "LAST TIME" as NSString
        headerStr.draw(at: CGPoint(x: 12, y: 10), withAttributes: headerAttrs)

        // Relative time
        let relativeStr    = relativeTimeString() as NSString
        let relativeAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: accent
        ]
        let relativeSize = relativeStr.size(withAttributes: relativeAttrs)
        relativeStr.draw(
            at: CGPoint(x: rect.width - relativeSize.width - 12, y: 10),
            withAttributes: relativeAttrs
        )

        // Separator line
        let sepColor = UIColor.white.withAlphaComponent(0.2)
        let sepPath  = UIBezierPath()
        sepPath.move(to: CGPoint(x: 12, y: 24))
        sepPath.addLine(to: CGPoint(x: rect.width - 12, y: 24))
        sepColor.setStroke()
        sepPath.lineWidth = 1
        sepPath.stroke()

        // Stars row — y = 36
        let starY: CGFloat = 36
        let starSize: CGFloat = 14
        let starSpacing: CGFloat = 2
        for i in 0..<5 {
            let filled = i < rating
            let starChar = filled ? "★" : "☆"
            let starColor: UIColor = filled ? accent : muted
            let starAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: starSize),
                .foregroundColor: starColor
            ]
            let starStr  = starChar as NSString
            let starW    = starStr.size(withAttributes: starAttrs).width
            starStr.draw(
                at: CGPoint(x: 12 + CGFloat(i) * (starW + starSpacing), y: starY),
                withAttributes: starAttrs
            )
        }

        // Tasting note — y = 56
        if let rawNote = note, !rawNote.isEmpty {
            let truncated: String
            if rawNote.count > 80 {
                truncated = String(rawNote.prefix(80)) + "…"
            } else {
                truncated = rawNote
            }
            let noteAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 9, weight: .regular),
                .foregroundColor: UIColor.white.withAlphaComponent(0.8)
            ]
            let noteRect = CGRect(x: 12, y: 56, width: 240, height: 46)
            let nsNote   = truncated as NSString
            nsNote.draw(
                with: noteRect,
                options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                attributes: noteAttrs,
                context: nil
            )
        }
    }

    // MARK: - Helpers

    private func relativeTimeString() -> String {
        let comps = Calendar.current.dateComponents(
            [.weekOfYear, .day],
            from: lastDate,
            to: Date()
        )
        if let weeks = comps.weekOfYear, weeks >= 1 {
            return "\(weeks) WEEK\(weeks == 1 ? "" : "S") AGO"
        } else if let days = comps.day, days >= 1 {
            return "\(days) DAY\(days == 1 ? "" : "S") AGO"
        } else {
            return "TODAY"
        }
    }
}
