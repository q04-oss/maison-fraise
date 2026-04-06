/// ARPriceHistoryView.swift
/// A draw(_:) view rendering a sparkline price history chart for a strawberry variety.
/// Renders to 300×110 pt. Displays a line chart with fill, min/max price labels,
/// season labels, and the latest price highlighted with an accent dot.

import UIKit

class ARPriceHistoryView: UIView {

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)

    struct PricePoint {
        let season: String
        let priceCents: Int
    }

    private let priceHistory: [PricePoint]

    init(priceHistory: [PricePoint]) {
        self.priceHistory = priceHistory
        super.init(frame: CGRect(x: 0, y: 0, width: 300, height: 110))
        backgroundColor = .clear
    }

    convenience init(json: String?) {
        self.init(priceHistory: ARPriceHistoryView.parsePriceHistory(from: json))
    }

    static func parsePriceHistory(from json: String?) -> [PricePoint] {
        guard
            let json = json,
            let data = json.data(using: .utf8),
            let array = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }
        return array.compactMap { dict -> PricePoint? in
            guard
                let season = dict["season"] as? String,
                let priceCents = dict["priceCents"] as? Int
            else { return nil }
            return PricePoint(season: season, priceCents: priceCents)
        }
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

        // Header
        let headerAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
            .foregroundColor: mutedWhite
        ]
        ("PRICE HISTORY" as NSString).draw(at: CGPoint(x: 12, y: 8), withAttributes: headerAttrs)

        // Empty state
        guard priceHistory.count >= 2 else {
            let emptyAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 10, weight: .regular),
                .foregroundColor: mutedWhite
            ]
            let emptyStr = "No price data" as NSString
            let emptySize = emptyStr.size(withAttributes: emptyAttrs)
            emptyStr.draw(at: CGPoint(x: rect.midX - emptySize.width / 2,
                                      y: rect.midY - emptySize.height / 2),
                          withAttributes: emptyAttrs)
            return
        }

        // Chart area
        let chartLeft: CGFloat = 46
        let chartRight: CGFloat = rect.width - 12
        let chartTop: CGFloat = 22
        let chartBottom: CGFloat = rect.height - 22
        let chartWidth = chartRight - chartLeft
        let chartHeight = chartBottom - chartTop

        let minPrice = priceHistory.map(\.priceCents).min()!
        let maxPrice = priceHistory.map(\.priceCents).max()!
        let priceRange = maxPrice - minPrice

        // Normalize helper
        func xPos(for index: Int) -> CGFloat {
            let ratio = CGFloat(index) / CGFloat(priceHistory.count - 1)
            return chartLeft + ratio * chartWidth
        }

        func yPos(for cents: Int) -> CGFloat {
            guard priceRange > 0 else { return chartTop + chartHeight / 2 }
            let ratio = CGFloat(cents - minPrice) / CGFloat(priceRange)
            return chartBottom - ratio * chartHeight
        }

        // Build sparkline path
        let linePath = UIBezierPath()
        for (i, point) in priceHistory.enumerated() {
            let pt = CGPoint(x: xPos(for: i), y: yPos(for: point.priceCents))
            if i == 0 { linePath.move(to: pt) }
            else { linePath.addLine(to: pt) }
        }

        // Fill area below line
        let fillPath = linePath.copy() as! UIBezierPath
        let lastPt = CGPoint(x: xPos(for: priceHistory.count - 1), y: chartBottom)
        let firstPt = CGPoint(x: xPos(for: 0), y: chartBottom)
        fillPath.addLine(to: lastPt)
        fillPath.addLine(to: firstPt)
        fillPath.close()

        ctx.saveGState()
        ctx.addPath(fillPath.cgPath)
        ctx.clip()
        ctx.setFillColor(UIColor.white.withAlphaComponent(0.08).cgColor)
        ctx.fill(rect)
        ctx.restoreGState()

        // Draw line
        ctx.saveGState()
        ctx.setStrokeColor(UIColor.white.cgColor)
        ctx.setLineWidth(1.5)
        ctx.setLineJoin(.round)
        ctx.setLineCap(.round)
        ctx.addPath(linePath.cgPath)
        ctx.strokePath()
        ctx.restoreGState()

        // Latest price dot (accent, 4pt radius)
        if let last = priceHistory.last {
            let lastIndex = priceHistory.count - 1
            let dotCenter = CGPoint(x: xPos(for: lastIndex), y: yPos(for: last.priceCents))
            let dotRect = CGRect(x: dotCenter.x - 4, y: dotCenter.y - 4, width: 8, height: 8)
            ctx.setFillColor(accent.cgColor)
            ctx.fillEllipse(in: dotRect)
        }

        // Price range labels (left = min, right = max... actually left y-axis = min/max)
        let priceAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: mutedWhite
        ]

        func formatCA(_ cents: Int) -> String {
            let dollars = Double(cents) / 100.0
            return String(format: "CA$%.2f", dollars)
        }

        let maxStr = formatCA(maxPrice) as NSString
        let minStr = formatCA(minPrice) as NSString
        maxStr.draw(at: CGPoint(x: 2, y: chartTop), withAttributes: priceAttrs)
        minStr.draw(at: CGPoint(x: 2, y: chartBottom - 10), withAttributes: priceAttrs)

        // Season labels (first and last)
        let seasonAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 6, weight: .regular),
            .foregroundColor: mutedWhite
        ]
        let firstSeason = priceHistory.first!.season as NSString
        let lastSeason = priceHistory.last!.season as NSString
        let lastSeasonSize = lastSeason.size(withAttributes: seasonAttrs)

        firstSeason.draw(at: CGPoint(x: chartLeft, y: chartBottom + 3), withAttributes: seasonAttrs)
        lastSeason.draw(at: CGPoint(x: chartRight - lastSeasonSize.width, y: chartBottom + 3),
                        withAttributes: seasonAttrs)
    }
}
