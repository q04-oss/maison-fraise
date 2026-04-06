/// ARAllergyFlagView.swift
/// Screen-space banner that appears briefly (2.5s) when allergens are detected,
/// then auto-removes itself. Slides in from the top with a spring animation.

import UIKit

class ARAllergyFlagView: UIView {

    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)
    private let allergens: [String]

    private let warningLabel = UILabel()
    private let titleLabel = UILabel()
    private let allergenLabel = UILabel()

    init(allergens: [String]) {
        self.allergens = allergens
        super.init(frame: .zero)
        setupView()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupView() {
        backgroundColor = UIColor(red: 0.85, green: 0.15, blue: 0.15, alpha: 0.95)
        layer.cornerRadius = 10
        layer.masksToBounds = false

        // Shadow
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.3
        layer.shadowRadius = 6
        layer.shadowOffset = CGSize(width: 0, height: 2)

        // Warning emoji
        warningLabel.text = "⚠️"
        warningLabel.font = .systemFont(ofSize: 16)
        warningLabel.translatesAutoresizingMaskIntoConstraints = false

        // "ALLERGY ALERT" title
        titleLabel.text = "ALLERGY ALERT"
        titleLabel.font = .monospacedSystemFont(ofSize: 10, weight: .bold)
        titleLabel.textColor = .white
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        // Allergen list
        let containsText = "Contains: " + allergens.joined(separator: ", ")
        allergenLabel.text = containsText
        allergenLabel.font = .systemFont(ofSize: 12, weight: .regular)
        allergenLabel.textColor = .white
        allergenLabel.numberOfLines = 0
        allergenLabel.translatesAutoresizingMaskIntoConstraints = false

        // Header stack: emoji + title
        let headerStack = UIStackView(arrangedSubviews: [warningLabel, titleLabel])
        headerStack.axis = .horizontal
        headerStack.spacing = 6
        headerStack.alignment = .center
        headerStack.translatesAutoresizingMaskIntoConstraints = false

        // Main stack
        let mainStack = UIStackView(arrangedSubviews: [headerStack, allergenLabel])
        mainStack.axis = .vertical
        mainStack.spacing = 4
        mainStack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(mainStack)
        translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            mainStack.topAnchor.constraint(equalTo: topAnchor, constant: 10),
            mainStack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10),
            mainStack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
            mainStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14)
        ])
    }

    /// Slides in from the top, holds for 2.5s, then slides back up and removes itself.
    func animateInAndRemove() {
        // Start off-screen (above, invisible)
        alpha = 0
        transform = CGAffineTransform(translationX: 0, y: -60)

        UIView.animate(
            withDuration: 0.3,
            delay: 0,
            usingSpringWithDamping: 0.7,
            initialSpringVelocity: 0.8,
            options: [],
            animations: {
                self.alpha = 1
                self.transform = .identity
            },
            completion: { _ in
                UIView.animate(
                    withDuration: 0.25,
                    delay: 2.5,
                    options: [],
                    animations: {
                        self.alpha = 0
                        self.transform = CGAffineTransform(translationX: 0, y: -60)
                    },
                    completion: { _ in
                        self.removeFromSuperview()
                    }
                )
            }
        )
    }
}
