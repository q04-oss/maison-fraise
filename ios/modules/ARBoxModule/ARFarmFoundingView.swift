// ARFarmFoundingView.swift
// Horizontal timeline showing farm founding year and key milestones.
// Renders at 300×80 pt for use as an SCNPlane texture.

import UIKit

class ARFarmFoundingView: UIView {

    struct Milestone {
        let year: Int
        let label: String
    }

    private let foundedYear: Int
    private let milestones: [Milestone]

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)

    private static let currentYear = 2026

    init(foundedYear: Int, milestones: [Milestone]) {
        self.foundedYear = foundedYear
        self.milestones  = milestones
        super.init(frame: CGRect(x: 0, y: 0, width: 300, height: 80))
        backgroundColor = .clear
    }

    convenience init(json: String?) {
        guard
            let jsonStr  = json,
            let data     = jsonStr.data(using: .utf8),
            let obj      = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let founded  = obj["founded_year"] as? Int
        else {
            self.init(foundedYear: 2010, milestones: [])
            return
        }

        var parsed: [Milestone] = []
        if let arr = obj["milestones"] as? [[String: Any]] {
            for item in arr {
                if let y = item["year"] as? Int, let l = item["label"] as? String {
                    parsed.append(Milestone(year: y, label: l))
                }
            }
        }
        self.init(foundedYear: founded, milestones: parsed)
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
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.4)
        ]
        ("FARM HISTORY" as NSString).draw(at: CGPoint(x: 12, y: 8), withAttributes: headerAttrs)

        // Timeline line
        let lineY: CGFloat   = 50
        let lineLeft: CGFloat  = 20
        let lineRight: CGFloat = 280

        ctx.saveGState()
        ctx.setStrokeColor(UIColor.white.withAlphaComponent(0.4).cgColor)
        ctx.setLineWidth(1.5)
        ctx.move(to:    CGPoint(x: lineLeft,  y: lineY))
        ctx.addLine(to: CGPoint(x: lineRight, y: lineY))
        ctx.strokePath()
        ctx.restoreGState()

        // Left dot (accent, 6pt)
        ctx.saveGState()
        ctx.setFillColor(accent.cgColor)
        ctx.fillEllipse(in: CGRect(x: lineLeft - 3, y: lineY - 3, width: 6, height: 6))
        ctx.restoreGState()

        // Right dot (white 0.6, 6pt)
        ctx.saveGState()
        ctx.setFillColor(UIColor.white.withAlphaComponent(0.6).cgColor)
        ctx.fillEllipse(in: CGRect(x: lineRight - 3, y: lineY - 3, width: 6, height: 6))
        ctx.restoreGState()

        // "EST. YYYY" label
        let estAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .medium),
            .foregroundColor: accent
        ]
        ("EST. \(foundedYear)" as NSString).draw(at: CGPoint(x: 12, y: lineY + 8), withAttributes: estAttrs)

        // "TODAY" label
        let todayAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.4)
        ]
        let todayStr = "TODAY" as NSString
        let todaySize = todayStr.size(withAttributes: todayAttrs)
        todayStr.draw(at: CGPoint(x: lineRight - todaySize.width, y: lineY + 8),
                      withAttributes: todayAttrs)

        // Milestone dots and labels
        let span = CGFloat(max(1, ARFarmFoundingView.currentYear - foundedYear))
        let milestoneAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 5, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.5)
        ]

        for milestone in milestones.prefix(3) {
            let t = CGFloat(milestone.year - foundedYear) / span
            let dotX = lineLeft + t * (lineRight - lineLeft)

            // Dot (4pt, white 0.5)
            ctx.saveGState()
            ctx.setFillColor(UIColor.white.withAlphaComponent(0.5).cgColor)
            ctx.fillEllipse(in: CGRect(x: dotX - 2, y: lineY - 2, width: 4, height: 4))
            ctx.restoreGState()

            // Label above dot
            let milStr = milestone.label as NSString
            let milSize = milStr.size(withAttributes: milestoneAttrs)
            milStr.draw(at: CGPoint(x: dotX - milSize.width / 2, y: 35 - milSize.height / 2),
                        withAttributes: milestoneAttrs)
        }
    }
}
