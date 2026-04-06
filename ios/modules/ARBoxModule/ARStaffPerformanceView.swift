/// ARStaffPerformanceView.swift
/// draw(_:) view showing 3 concentric 270° arcs for staff performance metrics:
/// Orders Today, Avg Prep Time, and Accuracy %.
/// Renders to 260×170 pt.

import UIKit

class ARStaffPerformanceView: UIView {

    private let accent  = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg      = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted   = UIColor.white.withAlphaComponent(0.4)

    private let prepBlue  = UIColor(red: 0.3,  green: 0.6,  blue: 1.0,  alpha: 1)
    private let accGreen  = UIColor(red: 0.2,  green: 0.8,  blue: 0.35, alpha: 1)

    private let ordersToday: Int
    private let avgPrepSeconds: Int
    private let accuracyPct: Double

    init(ordersToday: Int, avgPrepSeconds: Int, accuracyPct: Double) {
        self.ordersToday    = ordersToday
        self.avgPrepSeconds = avgPrepSeconds
        self.accuracyPct    = accuracyPct
        super.init(frame: CGRect(x: 0, y: 0, width: 260, height: 170))
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Draw

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        // Background pill
        let pillRect = rect.insetBy(dx: 2, dy: 2)
        let pillPath = UIBezierPath(roundedRect: pillRect, cornerRadius: 20)
        ctx.setFillColor(bg.cgColor)
        ctx.addPath(pillPath.cgPath)
        ctx.fillPath()

        // Header: "PERFORMANCE"
        let headerAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
            .foregroundColor: muted,
        ]
        let headerStr = "PERFORMANCE" as NSString
        headerStr.draw(at: CGPoint(x: 14, y: 12), withAttributes: headerAttrs)

        // Ring geometry
        let center = CGPoint(x: 110, y: 110)
        let startAngle: CGFloat = (135.0 / 180.0) * .pi
        let sweepAngle: CGFloat = (270.0 / 180.0) * .pi
        let lineWidth: CGFloat  = 8

        // Progress ratios
        let ordersRatio   = CGFloat(min(Double(ordersToday) / 40.0, 1.0))
        let prepRatio     = CGFloat(min(max((300.0 - Double(min(avgPrepSeconds, 600))) / 300.0, 0.0), 1.0))
        let accuracyRatio = CGFloat(min(max(accuracyPct / 100.0, 0.0), 1.0))

        let rings: [(radius: CGFloat, color: UIColor, progress: CGFloat)] = [
            (65, accent,    ordersRatio),
            (50, prepBlue,  prepRatio),
            (35, accGreen,  accuracyRatio),
        ]

        for ring in rings {
            // Track arc
            drawArc(ctx: ctx, center: center, radius: ring.radius,
                    startAngle: startAngle, sweepAngle: sweepAngle,
                    color: ring.color.withAlphaComponent(0.15), lineWidth: lineWidth)

            // Progress arc
            if ring.progress > 0 {
                drawArc(ctx: ctx, center: center, radius: ring.radius,
                        startAngle: startAngle, sweepAngle: sweepAngle * ring.progress,
                        color: ring.color, lineWidth: lineWidth)
            }
        }

        // Center: order count
        let countAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 18, weight: .bold),
            .foregroundColor: UIColor.white,
        ]
        let countStr = "\(ordersToday)" as NSString
        let countSize = countStr.size(withAttributes: countAttrs)
        countStr.draw(at: CGPoint(x: center.x - countSize.width / 2,
                                  y: center.y - countSize.height / 2 - 6),
                      withAttributes: countAttrs)

        let centerSubAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 6, weight: .regular),
            .foregroundColor: muted,
        ]
        let centerSubStr = "ORDERS" as NSString
        let centerSubSize = centerSubStr.size(withAttributes: centerSubAttrs)
        centerSubStr.draw(at: CGPoint(x: center.x - centerSubSize.width / 2,
                                       y: center.y + countSize.height / 2 - 4),
                          withAttributes: centerSubAttrs)

        // Right-side legend starting at x≈190
        drawLegend(ctx: ctx, rect: rect)
    }

    // MARK: - Legend

    private func drawLegend(ctx: CGContext, rect: CGRect) {
        let items: [(label: String, color: UIColor)] = [
            ("ORDERS",    accent),
            ("PREP TIME", prepBlue),
            ("ACCURACY",  accGreen),
        ]

        let dotSize: CGFloat   = 6
        let labelFont = UIFont.monospacedSystemFont(ofSize: 7, weight: .regular)
        let labelAttrs: [NSAttributedString.Key: Any] = [
            .font: labelFont,
            .foregroundColor: UIColor.white.withAlphaComponent(0.75),
        ]

        let legendX: CGFloat = 192
        var y: CGFloat = 74

        for item in items {
            // Dot
            let dotRect = CGRect(x: legendX, y: y, width: dotSize, height: dotSize)
            ctx.setFillColor(item.color.cgColor)
            ctx.fillEllipse(in: dotRect)

            // Label
            let lStr = item.label as NSString
            lStr.draw(at: CGPoint(x: legendX + dotSize + 5, y: y - 0.5),
                      withAttributes: labelAttrs)

            y += 18
        }
    }

    // MARK: - Arc helper

    private func drawArc(ctx: CGContext,
                         center: CGPoint,
                         radius: CGFloat,
                         startAngle: CGFloat,
                         sweepAngle: CGFloat,
                         color: UIColor,
                         lineWidth: CGFloat) {
        ctx.saveGState()
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(lineWidth)
        ctx.setLineCap(.round)
        let path = UIBezierPath(arcCenter: center,
                                radius: radius,
                                startAngle: startAngle,
                                endAngle: startAngle + sweepAngle,
                                clockwise: true)
        ctx.addPath(path.cgPath)
        ctx.strokePath()
        ctx.restoreGState()
    }
}
