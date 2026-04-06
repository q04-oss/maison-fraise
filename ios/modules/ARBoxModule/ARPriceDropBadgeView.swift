// ARPriceDropBadgeView.swift
// ARBoxModule — Maison Fraise
//
// draw(_:) badge showing a percentage price drop vs. last season.
// Pulses gently via a CABasicAnimation on transform.scale once added to a window.
// No storyboards.

import UIKit

final class ARPriceDropBadgeView: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted  = UIColor.white.withAlphaComponent(0.4)
    private let green  = UIColor(red: 0.2,   green: 0.75,  blue: 0.35,  alpha: 1)

    // MARK: - Data

    private let dropPercent: Int

    // MARK: - Init

    init(dropPercent: Int) {
        self.dropPercent = dropPercent
        super.init(frame: CGRect(x: 0, y: 0, width: 170, height: 65))
        backgroundColor = .clear
        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 170),
            heightAnchor.constraint(equalToConstant: 65)
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Lifecycle

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        guard layer.animation(forKey: "pulseBadge") == nil else { return }

        let pulse               = CABasicAnimation(keyPath: "transform.scale")
        pulse.fromValue         = 1.0
        pulse.toValue           = 1.04
        pulse.autoreverses      = true
        pulse.repeatCount       = .infinity
        pulse.duration          = 1.4
        pulse.timingFunction    = CAMediaTimingFunction(name: .easeInEaseOut)
        layer.add(pulse, forKey: "pulseBadge")
    }

    // MARK: - Drawing

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        // Background rounded rect
        let bgPath = UIBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: 14)
        bg.setFill()
        bgPath.fill()

        // Green border
        green.setStroke()
        bgPath.lineWidth = 1.5
        bgPath.stroke()

        // --- Left side: arrow + percent lines ---

        // Downward arrow "↓"
        let arrowAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 22),
            .foregroundColor: green
        ]
        let arrowStr = "↓" as NSString
        let arrowSize = arrowStr.size(withAttributes: arrowAttrs)
        arrowStr.draw(at: CGPoint(x: 10, y: (rect.height - arrowSize.height) / 2 - 2),
                      withAttributes: arrowAttrs)

        let leftX: CGFloat = 10 + arrowSize.width + 6

        // "X% FROM"
        let topLineAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 10, weight: .regular),
            .foregroundColor: UIColor.white
        ]
        let topLine = "\(dropPercent)% FROM" as NSString
        let topLineSize = topLine.size(withAttributes: topLineAttrs)
        topLine.draw(at: CGPoint(x: leftX, y: (rect.height / 2) - topLineSize.height - 1),
                     withAttributes: topLineAttrs)

        // "LAST SEASON"
        let bottomLineAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
            .foregroundColor: muted
        ]
        let bottomLine = "LAST SEASON" as NSString
        bottomLine.draw(at: CGPoint(x: leftX, y: rect.height / 2 + 1),
                        withAttributes: bottomLineAttrs)
    }
}
