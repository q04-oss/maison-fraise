// ARFarmVisitCTAView.swift
// ARBoxModule — Maison Fraise
//
// Screen-space overlay card prompting users to book a farm visit.
// Slides in from below on animateIn(). No storyboards.

import UIKit

final class ARFarmVisitCTAView: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted  = UIColor(white: 1, alpha: 0.45)

    // MARK: - Data

    private let visitDate: String
    private let spotsLeft: Int

    // MARK: - Callback

    var onTap: (() -> Void)?

    // MARK: - Subviews

    private let emojiLabel     = UILabel()
    private let tagLabel       = UILabel()
    private let dateLabel      = UILabel()
    private let spotsLabel     = UILabel()
    private let arrowLabel     = UILabel()

    // MARK: - Init

    init(visitDate: String, spotsLeft: Int) {
        self.visitDate = visitDate
        self.spotsLeft = spotsLeft
        super.init(frame: .zero)
        setupView()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Setup

    private func setupView() {
        layer.cornerRadius = 16
        clipsToBounds = false

        // Shadow
        layer.shadowColor   = UIColor.black.cgColor
        layer.shadowOpacity = 0.45
        layer.shadowRadius  = 12
        layer.shadowOffset  = CGSize(width: 0, height: 4)

        // Background pill
        backgroundColor = bg

        // Emoji
        emojiLabel.text     = "📅"
        emojiLabel.font     = .systemFont(ofSize: 18)
        emojiLabel.translatesAutoresizingMaskIntoConstraints = false

        // Tag line
        tagLabel.text          = "VISIT THE FARM"
        tagLabel.font          = .monospacedSystemFont(ofSize: 8, weight: .bold)
        tagLabel.textColor     = accent
        tagLabel.translatesAutoresizingMaskIntoConstraints = false

        // Date
        dateLabel.text         = visitDate
        dateLabel.font         = .systemFont(ofSize: 11, weight: .semibold)
        dateLabel.textColor    = .white
        dateLabel.translatesAutoresizingMaskIntoConstraints = false

        // Spots
        spotsLabel.text        = "\(spotsLeft) spots left"
        spotsLabel.font        = .systemFont(ofSize: 9)
        spotsLabel.textColor   = muted
        spotsLabel.translatesAutoresizingMaskIntoConstraints = false

        // Arrow
        arrowLabel.text        = "→"
        arrowLabel.font        = .systemFont(ofSize: 14, weight: .medium)
        arrowLabel.textColor   = UIColor.white.withAlphaComponent(0.7)
        arrowLabel.translatesAutoresizingMaskIntoConstraints = false

        // Right-side stack
        let rightStack = UIStackView(arrangedSubviews: [tagLabel, dateLabel, spotsLabel])
        rightStack.axis      = .vertical
        rightStack.spacing   = 2
        rightStack.alignment = .leading
        rightStack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(emojiLabel)
        addSubview(rightStack)
        addSubview(arrowLabel)

        NSLayoutConstraint.activate([
            emojiLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
            emojiLabel.centerYAnchor.constraint(equalTo: centerYAnchor),

            rightStack.leadingAnchor.constraint(equalTo: emojiLabel.trailingAnchor, constant: 10),
            rightStack.centerYAnchor.constraint(equalTo: centerYAnchor),
            rightStack.trailingAnchor.constraint(lessThanOrEqualTo: arrowLabel.leadingAnchor, constant: -8),

            arrowLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
            arrowLabel.centerYAnchor.constraint(equalTo: centerYAnchor),

            heightAnchor.constraint(equalToConstant: 64)
        ])

        // Tap gesture
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        addGestureRecognizer(tap)
        isUserInteractionEnabled = true
    }

    // MARK: - Actions

    @objc private func handleTap() {
        onTap?()
    }

    // MARK: - Animation

    func animateIn() {
        alpha = 0
        transform = CGAffineTransform(translationX: 0, y: 40)
        UIView.animate(
            withDuration: 0.55,
            delay: 0.5,
            usingSpringWithDamping: 0.72,
            initialSpringVelocity: 0.4,
            options: [.curveEaseOut],
            animations: {
                self.alpha     = 1
                self.transform = .identity
            }
        )
    }
}
