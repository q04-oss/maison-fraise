/// ARVarietyMascotView.swift
/// Floating mascot emoji view for AR variety overlays. 80×80 pt.
/// Spring bounce-in on appearance, then idle bob animation.

import UIKit

class ARVarietyMascotView: UIView {

    private let emojiLabel = UILabel()

    private static func emoji(for mascotId: String) -> String {
        switch mascotId {
        case "fruity":  return "🍓"
        case "tart":    return "⚡"
        case "floral":  return "🌸"
        case "earthy":  return "🌱"
        case "rare":    return "💎"
        case "classic": return "⭐"
        default:        return "🍓"
        }
    }

    init(mascotId: String) {
        super.init(frame: CGRect(x: 0, y: 0, width: 80, height: 80))
        backgroundColor = .clear

        emojiLabel.text = ARVarietyMascotView.emoji(for: mascotId)
        emojiLabel.font = UIFont.systemFont(ofSize: 40)
        emojiLabel.textAlignment = .center
        emojiLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(emojiLabel)

        NSLayoutConstraint.activate([
            emojiLabel.centerXAnchor.constraint(equalTo: centerXAnchor),
            emojiLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        startBounceIn()
    }

    // MARK: - Animations

    private func startBounceIn() {
        emojiLabel.transform = CGAffineTransform(scaleX: 0.1, y: 0.1)

        UIView.animate(
            withDuration: 0.6,
            delay: 0,
            usingSpringWithDamping: 0.5,
            initialSpringVelocity: 0.8,
            options: [],
            animations: {
                self.emojiLabel.transform = .identity
            },
            completion: { _ in
                self.startIdleBob()
            }
        )
    }

    private func startIdleBob() {
        UIView.animate(
            withDuration: 1.8,
            delay: 0,
            options: [.autoreverse, .repeat, .curveEaseInOut],
            animations: {
                self.emojiLabel.transform = CGAffineTransform(translationX: 0, y: -5)
            },
            completion: nil
        )
    }
}
