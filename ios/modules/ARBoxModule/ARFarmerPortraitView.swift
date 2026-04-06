// ARFarmerPortraitView.swift
// UIKit overlay showing farmer name, quote, and an avatar placeholder.
// Used directly as a UIKit overlay pinned with AutoLayout. 240×180 pt.

import UIKit

class ARFarmerPortraitView: UIView {

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)

    init(farmerName: String, quote: String) {
        super.init(frame: CGRect(x: 0, y: 0, width: 240, height: 180))
        backgroundColor = .clear
        setupSubviews(farmerName: farmerName, quote: quote)
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupSubviews(farmerName: String, quote: String) {
        // Background card
        let card = UIView()
        card.backgroundColor  = bg
        card.layer.cornerRadius = 20
        card.clipsToBounds    = true
        card.translatesAutoresizingMaskIntoConstraints = false
        addSubview(card)

        // "FROM THE FARMER" label
        let topLabel = UILabel()
        topLabel.text          = "FROM THE FARMER"
        topLabel.font          = UIFont.monospacedSystemFont(ofSize: 9, weight: .regular)
        topLabel.textColor     = UIColor.white.withAlphaComponent(0.4)
        topLabel.textAlignment = .center
        topLabel.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(topLabel)

        // Avatar circle
        let avatarView = UIView()
        avatarView.backgroundColor    = accent
        avatarView.layer.cornerRadius = 30
        avatarView.clipsToBounds      = true
        avatarView.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(avatarView)

        let emojiLabel = UILabel()
        emojiLabel.text          = "👨‍🌾"
        emojiLabel.font          = UIFont.systemFont(ofSize: 30)
        emojiLabel.textAlignment = .center
        emojiLabel.translatesAutoresizingMaskIntoConstraints = false
        avatarView.addSubview(emojiLabel)

        // Farmer name
        let nameLabel = UILabel()
        nameLabel.text          = farmerName
        nameLabel.font          = UIFont.systemFont(ofSize: 16, weight: .semibold)
        nameLabel.textColor     = .white
        nameLabel.textAlignment = .center
        nameLabel.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(nameLabel)

        // Separator
        let separator = UIView()
        separator.backgroundColor             = accent
        separator.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(separator)

        // Quote
        let quoteLabel = UILabel()
        quoteLabel.text          = quote
        quoteLabel.font          = UIFont.italicSystemFont(ofSize: 12)
        quoteLabel.textColor     = UIColor.white.withAlphaComponent(0.7)
        quoteLabel.textAlignment = .center
        quoteLabel.numberOfLines = 3
        quoteLabel.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(quoteLabel)

        NSLayoutConstraint.activate([
            // Card fills the view
            card.leadingAnchor.constraint(equalTo: leadingAnchor),
            card.trailingAnchor.constraint(equalTo: trailingAnchor),
            card.topAnchor.constraint(equalTo: topAnchor),
            card.bottomAnchor.constraint(equalTo: bottomAnchor),

            // Top label
            topLabel.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            topLabel.topAnchor.constraint(equalTo: card.topAnchor, constant: 12),

            // Avatar
            avatarView.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            avatarView.topAnchor.constraint(equalTo: topLabel.bottomAnchor, constant: 8),
            avatarView.widthAnchor.constraint(equalToConstant: 60),
            avatarView.heightAnchor.constraint(equalToConstant: 60),

            // Emoji inside avatar
            emojiLabel.centerXAnchor.constraint(equalTo: avatarView.centerXAnchor),
            emojiLabel.centerYAnchor.constraint(equalTo: avatarView.centerYAnchor),

            // Name
            nameLabel.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            nameLabel.topAnchor.constraint(equalTo: avatarView.bottomAnchor, constant: 8),

            // Separator
            separator.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            separator.topAnchor.constraint(equalTo: nameLabel.bottomAnchor, constant: 6),
            separator.widthAnchor.constraint(equalToConstant: 40),
            separator.heightAnchor.constraint(equalToConstant: 1),

            // Quote
            quoteLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            quoteLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            quoteLabel.topAnchor.constraint(equalTo: separator.bottomAnchor, constant: 8),
            quoteLabel.bottomAnchor.constraint(lessThanOrEqualTo: card.bottomAnchor, constant: -12),
        ])
    }
}
