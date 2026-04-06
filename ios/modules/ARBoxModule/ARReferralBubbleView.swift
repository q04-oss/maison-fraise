// ARReferralBubbleView.swift
// ARBoxModule — Maison Fraise
//
// Accent-colored pill inviting the user to share for store credit.
// Animates in/out with a spring scale + fade. No storyboards.

import UIKit

final class ARReferralBubbleView: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted  = UIColor.white.withAlphaComponent(0.4)

    // MARK: - Callback

    var onTap: (() -> Void)?

    // MARK: - Subviews

    private let giftLabel   = UILabel()
    private let messageLabel = UILabel()
    private let arrowButton  = UIButton(type: .system)

    // MARK: - Init

    init() {
        super.init(frame: .zero)
        setupView()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Setup

    private func setupView() {
        backgroundColor    = accent
        layer.cornerRadius = 20
        clipsToBounds      = true

        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 270),
            heightAnchor.constraint(equalToConstant: 80)
        ])

        // Gift emoji
        giftLabel.text     = "🎁"
        giftLabel.font     = .systemFont(ofSize: 20)
        giftLabel.translatesAutoresizingMaskIntoConstraints = false

        // Message
        messageLabel.text          = "Share → CA$5 credit"
        messageLabel.font          = .systemFont(ofSize: 13, weight: .semibold)
        messageLabel.textColor     = .black
        messageLabel.numberOfLines = 1
        messageLabel.translatesAutoresizingMaskIntoConstraints = false

        // Arrow button
        arrowButton.setTitle("→", for: .normal)
        arrowButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        arrowButton.setTitleColor(.black, for: .normal)
        arrowButton.translatesAutoresizingMaskIntoConstraints = false
        arrowButton.addTarget(self, action: #selector(arrowTapped), for: .touchUpInside)

        addSubview(giftLabel)
        addSubview(messageLabel)
        addSubview(arrowButton)

        NSLayoutConstraint.activate([
            giftLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            giftLabel.centerYAnchor.constraint(equalTo: centerYAnchor),

            messageLabel.leadingAnchor.constraint(equalTo: giftLabel.trailingAnchor, constant: 10),
            messageLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
            messageLabel.trailingAnchor.constraint(lessThanOrEqualTo: arrowButton.leadingAnchor, constant: -8),

            arrowButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            arrowButton.centerYAnchor.constraint(equalTo: centerYAnchor)
        ])
    }

    // MARK: - Animation

    func animateIn() {
        alpha     = 0
        transform = CGAffineTransform(scaleX: 0.8, y: 0.8)
        UIView.animate(
            withDuration: 0.45,
            delay: 0,
            usingSpringWithDamping: 0.65,
            initialSpringVelocity: 0.5,
            options: .curveEaseOut
        ) {
            self.alpha     = 1
            self.transform = .identity
        }
    }

    func animateOut() {
        UIView.animate(
            withDuration: 0.35,
            delay: 0,
            usingSpringWithDamping: 0.8,
            initialSpringVelocity: 0,
            options: .curveEaseIn
        ) {
            self.alpha     = 0
            self.transform = CGAffineTransform(scaleX: 0.8, y: 0.8)
        } completion: { _ in
            self.removeFromSuperview()
        }
    }

    // MARK: - Actions

    @objc private func arrowTapped() {
        onTap?()
    }
}
