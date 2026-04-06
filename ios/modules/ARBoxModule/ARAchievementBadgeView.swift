/// ARAchievementBadgeView.swift
/// Screen-space overlay showing milestone achievement badges in the same stamp style
/// as ARPassportStampView. Supports multiple achievements shown sequentially with a
/// 0.5s gap between each.

import UIKit

class ARAchievementBadgeView: UIView {

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)

    private struct AchievementDefinition {
        let label: String
        let emoji: String
    }

    private static let definitions: [String: AchievementDefinition] = [
        "order_10":    AchievementDefinition(label: "10 ORDERS",     emoji: "🎯"),
        "order_25":    AchievementDefinition(label: "25 ORDERS",     emoji: "⭐"),
        "order_50":    AchievementDefinition(label: "50 ORDERS",     emoji: "🏆"),
        "first_winter":AchievementDefinition(label: "WINTER VARIETY",emoji: "❄️"),
        "three_farms": AchievementDefinition(label: "3 FARMS",       emoji: "🗺️"),
        "full_season": AchievementDefinition(label: "FULL SEASON",   emoji: "🌱")
    ]

    private let achievementIds: [String]
    private var currentIndex: Int = 0

    private let emojiLabel = UILabel()
    private let achievementLabel = UILabel()
    private let unlockedLabel = UILabel()
    private let yearLabel = UILabel()

    init(achievementIds: [String]) {
        self.achievementIds = achievementIds
        super.init(frame: CGRect(x: 0, y: 0, width: 140, height: 140))
        setupView()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupView() {
        backgroundColor = bg
        layer.cornerRadius = 70
        layer.masksToBounds = true
        layer.borderColor = accent.cgColor
        layer.borderWidth = 4

        emojiLabel.font = .systemFont(ofSize: 32)
        emojiLabel.textAlignment = .center
        emojiLabel.translatesAutoresizingMaskIntoConstraints = false

        achievementLabel.font = .monospacedSystemFont(ofSize: 11, weight: .bold)
        achievementLabel.textColor = accent
        achievementLabel.textAlignment = .center
        achievementLabel.numberOfLines = 2
        achievementLabel.translatesAutoresizingMaskIntoConstraints = false

        unlockedLabel.text = "UNLOCKED"
        unlockedLabel.font = .monospacedSystemFont(ofSize: 7, weight: .regular)
        unlockedLabel.textColor = UIColor.white.withAlphaComponent(0.45)
        unlockedLabel.textAlignment = .center
        unlockedLabel.translatesAutoresizingMaskIntoConstraints = false

        let calendar = Calendar.current
        let year = calendar.component(.year, from: Date())
        yearLabel.text = "\(year)"
        yearLabel.font = .monospacedSystemFont(ofSize: 7, weight: .regular)
        yearLabel.textColor = UIColor.white.withAlphaComponent(0.45)
        yearLabel.textAlignment = .center
        yearLabel.translatesAutoresizingMaskIntoConstraints = false

        let stack = UIStackView(arrangedSubviews: [emojiLabel, achievementLabel, unlockedLabel, yearLabel])
        stack.axis = .vertical
        stack.spacing = 2
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 10),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -10)
        ])
    }

    private func configure(for achievementId: String) {
        guard let def = Self.definitions[achievementId] else {
            emojiLabel.text = "🏅"
            achievementLabel.text = achievementId.uppercased()
            return
        }
        emojiLabel.text = def.emoji
        achievementLabel.text = def.label
    }

    /// Animates in the first achievement immediately, then schedules subsequent ones
    /// with 0.5s gaps between each (after the current one finishes).
    func animateAndRemove() {
        guard currentIndex < achievementIds.count else { return }
        configure(for: achievementIds[currentIndex])
        showCurrentBadge()
    }

    private func showCurrentBadge() {
        alpha = 0
        transform = CGAffineTransform(scaleX: 0.4, y: 0.4)

        UIView.animate(
            withDuration: 0.4,
            delay: 0,
            usingSpringWithDamping: 0.6,
            initialSpringVelocity: 0.5,
            options: [],
            animations: {
                self.alpha = 1
                self.transform = .identity
            },
            completion: { _ in
                UIView.animate(
                    withDuration: 0.3,
                    delay: 2.5,
                    options: [],
                    animations: {
                        self.alpha = 0
                        self.transform = CGAffineTransform(scaleX: 0.8, y: 0.8)
                    },
                    completion: { _ in
                        self.currentIndex += 1
                        if self.currentIndex < self.achievementIds.count {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                                self.configure(for: self.achievementIds[self.currentIndex])
                                self.showCurrentBadge()
                            }
                        } else {
                            self.removeFromSuperview()
                        }
                    }
                )
            }
        )
    }
}
