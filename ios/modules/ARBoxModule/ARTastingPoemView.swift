/// ARTastingPoemView.swift
/// Renders a generative tasting poem on a parchment background.
/// Size: 300×180 pt.

import UIKit

class ARTastingPoemView: UIView {
    private let poem: String

    init(poem: String) {
        self.poem = poem
        super.init(frame: CGRect(x: 0, y: 0, width: 300, height: 180))
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        // Parchment background
        let parchment = UIColor(red: 0.98, green: 0.96, blue: 0.90, alpha: 0.95)
        let pillPath = UIBezierPath(roundedRect: rect.insetBy(dx: 2, dy: 2), cornerRadius: 14)
        ctx.setFillColor(parchment.cgColor)
        ctx.addPath(pillPath.cgPath)
        ctx.fillPath()

        // Decorative border
        let borderPath = UIBezierPath(roundedRect: rect.insetBy(dx: 5, dy: 5), cornerRadius: 11)
        ctx.setStrokeColor(UIColor(red: 0.7, green: 0.5, blue: 0.3, alpha: 0.6).cgColor)
        ctx.setLineWidth(0.5)
        ctx.addPath(borderPath.cgPath)
        ctx.strokePath()

        // Header
        let headerAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: UIColor(red: 0.45, green: 0.30, blue: 0.15, alpha: 0.7),
        ]
        let header = "TASTING POEM" as NSString
        let hSize = header.size(withAttributes: headerAttrs)
        header.draw(at: CGPoint(x: rect.midX - hSize.width / 2, y: 12), withAttributes: headerAttrs)

        // Poem lines
        let inkColor = UIColor(red: 0.25, green: 0.15, blue: 0.08, alpha: 1)
        let lineAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont(name: "Georgia-Italic", size: 14) ?? UIFont.systemFont(ofSize: 14, weight: .light),
            .foregroundColor: inkColor,
        ]
        let lines = poem.components(separatedBy: "\n").filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        let lineSpacing: CGFloat = 26
        let startY: CGFloat = 34
        for (i, line) in lines.prefix(4).enumerated() {
            let nsLine = line as NSString
            let lineSize = nsLine.size(withAttributes: lineAttrs)
            let x = rect.midX - lineSize.width / 2
            let y = startY + CGFloat(i) * lineSpacing
            nsLine.draw(at: CGPoint(x: max(12, x), y: y), withAttributes: lineAttrs)
        }
    }
}
