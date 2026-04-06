// ARWordCloudView.swift
// ARBoxModule — Maison Fraise
//
// draw(_:) word cloud showing tasting terms sized by frequency.
// Simple greedy left-to-right, top-to-bottom placement; wraps at 280pt.
// No storyboards.

import UIKit

final class ARWordCloudView: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted  = UIColor.white.withAlphaComponent(0.4)

    // MARK: - Data

    private let words: [(word: String, count: Int)]

    // MARK: - Init

    init(words: [(word: String, count: Int)]) {
        // Cap at 20, sort descending by count
        let sorted = words.sorted { $0.count > $1.count }
        self.words = Array(sorted.prefix(20))
        super.init(frame: CGRect(x: 0, y: 0, width: 300, height: 190))
        backgroundColor = .clear
        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 300),
            heightAnchor.constraint(equalToConstant: 190)
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Drawing

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        // Background pill
        let pillPath = UIBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: 20)
        bg.setFill()
        pillPath.fill()

        // Header
        let headerAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: muted
        ]
        ("WHAT OTHERS TASTE" as NSString).draw(at: CGPoint(x: 12, y: 8), withAttributes: headerAttrs)

        guard !words.isEmpty else { return }

        let maxCount = CGFloat(words[0].count)
        let minX: CGFloat = 12
        let maxX: CGFloat = 288
        let minY: CGFloat = 22
        let maxY: CGFloat = 182

        var cursorX = minX
        var cursorY = minY

        ctx.saveGState()
        pillPath.addClip()

        for (index, entry) in words.enumerated() {
            let fontSize: CGFloat = 8 + (CGFloat(entry.count) / maxCount) * 14
            let color: UIColor    = index % 2 == 0 ? accent : .white
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: fontSize, weight: .regular),
                .foregroundColor: color
            ]
            let nsWord    = entry.word as NSString
            let wordSize  = nsWord.size(withAttributes: attrs)

            // Wrap if needed
            if cursorX + wordSize.width > maxX && cursorX > minX {
                cursorX  = minX
                cursorY += fontSize + 4
            }

            if cursorY > maxY { break }

            nsWord.draw(at: CGPoint(x: cursorX, y: cursorY), withAttributes: attrs)
            cursorX += wordSize.width + 6
        }

        ctx.restoreGState()
    }
}
