/// ARThankYouOverlay.swift
/// Full-screen thank-you overlay with confetti. Presented programmatically,
/// auto-dismisses after ~2.4s. No public init — use the static presenter.

import UIKit

class ARThankYouOverlay {

    private static let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)

    /// Present a full-screen thank-you overlay over `view`.
    static func present(farmName: String, in view: UIView) {
        let overlay = UIView(frame: view.bounds)
        overlay.backgroundColor = UIColor.black.withAlphaComponent(0.7)

        // Centered label
        let label = UILabel()
        label.text = "Thank you for supporting\n\(farmName)"
        label.font = UIFont(name: "Georgia", size: 24) ?? UIFont.systemFont(ofSize: 24, weight: .light)
        label.textColor = .white
        label.textAlignment = .center
        label.numberOfLines = 2
        label.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: overlay.leadingAnchor, constant: 32),
            label.trailingAnchor.constraint(lessThanOrEqualTo: overlay.trailingAnchor, constant: -32),
        ])

        // Confetti dots
        let confettiGreen = UIColor(red: 0.2, green: 0.8, blue: 0.3, alpha: 1)
        let colors: [UIColor] = [accent, .white, confettiGreen]

        for _ in 0..<30 {
            let dot = UIView(frame: CGRect(
                x: CGFloat.random(in: 0..<view.bounds.width),
                y: -10,
                width: 6,
                height: 6
            ))
            dot.backgroundColor = colors.randomElement()
            dot.layer.cornerRadius = 3
            overlay.addSubview(dot)

            let animator = UIViewPropertyAnimator(
                duration: Double.random(in: 1.2...2.0),
                curve: .easeIn
            ) {
                dot.frame.origin.y = view.bounds.height + 20
                dot.transform = CGAffineTransform(rotationAngle: .random(in: 0...6.28))
            }
            animator.startAnimation(afterDelay: Double.random(in: 0...0.5))
        }

        // Add and fade in
        view.addSubview(overlay)
        overlay.alpha = 0

        UIView.animate(withDuration: 0.3) {
            overlay.alpha = 1
        }

        // Auto-dismiss after 2.0s
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            UIView.animate(withDuration: 0.4, animations: {
                overlay.alpha = 0
            }, completion: { _ in
                overlay.removeFromSuperview()
            })
        }
    }
}
