/// ARNutritionRingsView.swift
/// A draw(_:) view for use as an SCNPlane texture. Renders three concentric 270° arcs
/// representing Vitamin C, Fiber, and Calories relative to daily recommended amounts.
/// Renders to 260×260 pt.

import UIKit

class ARNutritionRingsView: UIView {

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)

    private let vitaminCMg: Double
    private let fiberG: Double
    private let caloriesKcal: Double

    // Ring colors
    private let fiberGreen = UIColor(red: 0.18, green: 0.72, blue: 0.36, alpha: 1)
    private let caloriesBlue = UIColor(red: 0.31, green: 0.60, blue: 0.95, alpha: 1)

    init(vitaminCMg: Double, fiberG: Double, caloriesKcal: Double) {
        self.vitaminCMg = vitaminCMg
        self.fiberG = fiberG
        self.caloriesKcal = caloriesKcal
        super.init(frame: CGRect(x: 0, y: 0, width: 260, height: 260))
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let center = CGPoint(x: rect.midX, y: rect.midY)

        // Background dark circle
        let circleRect = rect.insetBy(dx: 2, dy: 2)
        ctx.setFillColor(bg.cgColor)
        ctx.fillEllipse(in: circleRect)

        // 270° sweep starting from bottom-left = 135° in standard math = 135 * π/180
        // Start angle: 135° (bottom-left), sweeping 270° clockwise
        let sweepAngle: CGFloat = (270.0 / 180.0) * .pi
        let startAngle: CGFloat = (135.0 / 180.0) * .pi // bottom-left in UIKit coords (y flipped)

        // Progress values clamped 0–1
        let vitaminCProgress = CGFloat(min(max(vitaminCMg / 90.0, 0), 1))
        let fiberProgress = CGFloat(min(max(fiberG / 25.0, 0), 1))
        let caloriesProgress = CGFloat(min(max(caloriesKcal / 200.0, 0), 1))

        let rings: [(radius: CGFloat, color: UIColor, progress: CGFloat, label: String)] = [
            (100, accent, vitaminCProgress, "C"),
            (76, fiberGreen, fiberProgress, "FIBER"),
            (52, caloriesBlue, caloriesProgress, "KCAL")
        ]

        let lineWidth: CGFloat = 8

        for ring in rings {
            // Track arc (muted)
            let trackColor = ring.color.withAlphaComponent(0.15)
            drawArc(ctx: ctx, center: center, radius: ring.radius,
                    startAngle: startAngle, sweepAngle: sweepAngle,
                    color: trackColor, lineWidth: lineWidth)

            // Progress arc
            if ring.progress > 0 {
                drawArc(ctx: ctx, center: center, radius: ring.radius,
                        startAngle: startAngle, sweepAngle: sweepAngle * ring.progress,
                        color: ring.color, lineWidth: lineWidth)
            }

            // Label at the end of each ring arc (bottom-left region)
            let labelAngle = startAngle + sweepAngle + 0.15
            let labelX = center.x + (ring.radius + 12) * cos(labelAngle)
            let labelY = center.y + (ring.radius + 12) * sin(labelAngle)
            let labelAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 6, weight: .regular),
                .foregroundColor: UIColor.white.withAlphaComponent(0.45)
            ]
            let labelStr = ring.label as NSString
            let labelSize = labelStr.size(withAttributes: labelAttrs)
            labelStr.draw(at: CGPoint(x: labelX - labelSize.width / 2,
                                      y: labelY - labelSize.height / 2),
                          withAttributes: labelAttrs)
        }

        // Center text: "TODAY" label
        let todayAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.4)
        ]
        let todayStr = "TODAY" as NSString
        let todaySize = todayStr.size(withAttributes: todayAttrs)
        todayStr.draw(at: CGPoint(x: center.x - todaySize.width / 2,
                                   y: center.y - todaySize.height - 4),
                      withAttributes: todayAttrs)

        // Center text: total kcal
        let kcalAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 13, weight: .bold),
            .foregroundColor: UIColor.white
        ]
        let kcalStr = "\(Int(caloriesKcal))" as NSString
        let kcalSize = kcalStr.size(withAttributes: kcalAttrs)
        kcalStr.draw(at: CGPoint(x: center.x - kcalSize.width / 2,
                                  y: center.y + 2),
                     withAttributes: kcalAttrs)
    }

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
