// ARChallengeQuestView.swift
// ARBoxModule — Maison Fraise
//
// Dark amber-brown card displaying a weekly challenge with title, description,
// and an animated progress bar. No storyboards.

import UIKit

final class ARChallengeQuestView: UIView {

    // MARK: - Style

    private let accent      = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg          = UIColor(red: 0.12,  green: 0.09,  blue: 0.05,  alpha: 0.95)
    private let muted       = UIColor.white.withAlphaComponent(0.4)
    private let borderColor = UIColor(red: 0.5,   green: 0.35,  blue: 0.1,   alpha: 0.8)

    // MARK: - Data

    private let progress: Int
    private let target:   Int

    // MARK: - Subviews

    private let badgeLabel       = UILabel()
    private let titleLabel       = UILabel()
    private let descriptionLabel = UILabel()
    private let trackView        = UIView()
    private let fillView         = UIView()
    private let progressLabel    = UILabel()

    // MARK: - Init

    init(title: String, description: String, progress: Int, target: Int) {
        self.progress = max(0, progress)
        self.target   = max(1, target)
        super.init(frame: .zero)
        setupView(title: title, description: description)
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Layout

    override func layoutSubviews() {
        super.layoutSubviews()
        updateFillWidth()
    }

    // MARK: - Setup

    private func setupView(title: String, description: String) {
        backgroundColor    = bg
        layer.cornerRadius = 18
        clipsToBounds      = true
        layer.borderWidth  = 1
        layer.borderColor  = borderColor.cgColor

        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 280),
            heightAnchor.constraint(equalToConstant: 130)
        ])

        // "⚔ WEEKLY CHALLENGE" badge
        badgeLabel.text      = "⚔ WEEKLY CHALLENGE"
        badgeLabel.font      = .monospacedSystemFont(ofSize: 7, weight: .regular)
        badgeLabel.textColor = accent
        badgeLabel.translatesAutoresizingMaskIntoConstraints = false

        // Title
        titleLabel.text          = title
        titleLabel.font          = .systemFont(ofSize: 13, weight: .semibold)
        titleLabel.textColor     = .white
        titleLabel.numberOfLines = 1
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        // Description
        descriptionLabel.text          = description
        descriptionLabel.font          = .systemFont(ofSize: 10)
        descriptionLabel.textColor     = UIColor.white.withAlphaComponent(0.6)
        descriptionLabel.numberOfLines = 2
        descriptionLabel.translatesAutoresizingMaskIntoConstraints = false

        // Track view
        trackView.backgroundColor    = UIColor(white: 1, alpha: 0.12)
        trackView.layer.cornerRadius = 3
        trackView.clipsToBounds      = true
        trackView.translatesAutoresizingMaskIntoConstraints = false

        // Fill view
        fillView.backgroundColor    = accent
        fillView.layer.cornerRadius = 3
        fillView.translatesAutoresizingMaskIntoConstraints = false
        trackView.addSubview(fillView)

        // Progress label
        let safeTarget = max(1, target)
        progressLabel.text          = "\(progress) / \(safeTarget) COMPLETE"
        progressLabel.font          = .monospacedSystemFont(ofSize: 7, weight: .regular)
        progressLabel.textColor     = muted
        progressLabel.textAlignment = .right
        progressLabel.translatesAutoresizingMaskIntoConstraints = false

        addSubview(badgeLabel)
        addSubview(titleLabel)
        addSubview(descriptionLabel)
        addSubview(trackView)
        addSubview(progressLabel)

        NSLayoutConstraint.activate([
            badgeLabel.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            badgeLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),

            titleLabel.topAnchor.constraint(equalTo: badgeLabel.bottomAnchor, constant: 5),
            titleLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            titleLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),

            descriptionLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 3),
            descriptionLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            descriptionLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),

            trackView.topAnchor.constraint(equalTo: descriptionLabel.bottomAnchor, constant: 8),
            trackView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            trackView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            trackView.heightAnchor.constraint(equalToConstant: 6),

            fillView.leadingAnchor.constraint(equalTo: trackView.leadingAnchor),
            fillView.topAnchor.constraint(equalTo: trackView.topAnchor),
            fillView.bottomAnchor.constraint(equalTo: trackView.bottomAnchor),

            progressLabel.topAnchor.constraint(equalTo: trackView.bottomAnchor, constant: 4),
            progressLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            progressLabel.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -8)
        ])
    }

    // MARK: - Fill Width

    private func updateFillWidth() {
        let trackWidth = trackView.bounds.width
        guard trackWidth > 0 else { return }
        let ratio: CGFloat = min(1, CGFloat(progress) / CGFloat(target))
        let fillWidth = trackWidth * ratio

        // Remove any previously added width constraint
        fillView.constraints.forEach { c in
            if c.firstAttribute == .width { fillView.removeConstraint(c) }
        }
        fillView.widthAnchor.constraint(equalToConstant: fillWidth).isActive = true
    }
}
