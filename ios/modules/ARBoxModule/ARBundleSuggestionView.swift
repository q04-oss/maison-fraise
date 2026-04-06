// ARBundleSuggestionView.swift
// ARBoxModule — Maison Fraise
//
// Compact AR overlay card suggesting a complementary product from the shop.
// Shows a pairing header, product title, formatted price, and an ADD action.
// No storyboards.

import UIKit

final class ARBundleSuggestionView: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted  = UIColor.white.withAlphaComponent(0.4)

    // MARK: - Callback

    var onTap: (() -> Void)?

    // MARK: - Subviews

    private let accentBar     = UIView()
    private let headerLabel   = UILabel()
    private let titleLabel    = UILabel()
    private let priceLabel    = UILabel()
    private let addButton     = UIButton(type: .system)
    private let contentStack  = UIStackView()

    // MARK: - Init

    init(title: String, priceCents: Int) {
        super.init(frame: .zero)
        setupView(title: title, priceCents: priceCents)
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Setup

    private func setupView(title: String, priceCents: Int) {
        backgroundColor   = bg
        layer.cornerRadius = 18
        clipsToBounds = true

        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 280),
            heightAnchor.constraint(equalToConstant: 100)
        ])

        // Left accent bar
        accentBar.backgroundColor = accent
        accentBar.translatesAutoresizingMaskIntoConstraints = false
        addSubview(accentBar)
        NSLayoutConstraint.activate([
            accentBar.leadingAnchor.constraint(equalTo: leadingAnchor),
            accentBar.topAnchor.constraint(equalTo: topAnchor),
            accentBar.bottomAnchor.constraint(equalTo: bottomAnchor),
            accentBar.widthAnchor.constraint(equalToConstant: 3)
        ])

        // Header label
        headerLabel.text      = "PAIRS WELL IN THE SHOP"
        headerLabel.font      = .monospacedSystemFont(ofSize: 7, weight: .regular)
        headerLabel.textColor = muted

        // Title label
        titleLabel.text          = title
        titleLabel.font          = .systemFont(ofSize: 14, weight: .semibold)
        titleLabel.textColor     = .white
        titleLabel.numberOfLines = 1

        // Price label
        let dollars = priceCents / 100
        let cents   = priceCents % 100
        priceLabel.text      = String(format: "CA$%d.%02d", dollars, cents)
        priceLabel.font      = .monospacedSystemFont(ofSize: 13, weight: .regular)
        priceLabel.textColor = accent

        // Text stack (header + title + price)
        let textStack = UIStackView(arrangedSubviews: [headerLabel, titleLabel, priceLabel])
        textStack.axis      = .vertical
        textStack.spacing   = 2
        textStack.alignment = .leading

        // ADD button
        addButton.setTitle("ADD →", for: .normal)
        addButton.titleLabel?.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        addButton.setTitleColor(accent, for: .normal)
        addButton.translatesAutoresizingMaskIntoConstraints = false
        addButton.widthAnchor.constraint(equalToConstant: 54).isActive = true
        addButton.addTarget(self, action: #selector(addTapped), for: .touchUpInside)

        // Horizontal content stack: textStack | addButton
        contentStack.axis      = .horizontal
        contentStack.alignment = .center
        contentStack.spacing   = 8
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        contentStack.addArrangedSubview(textStack)
        contentStack.addArrangedSubview(addButton)

        addSubview(contentStack)
        NSLayoutConstraint.activate([
            contentStack.leadingAnchor.constraint(equalTo: accentBar.trailingAnchor, constant: 10),
            contentStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            contentStack.topAnchor.constraint(equalTo: topAnchor, constant: 10),
            contentStack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10)
        ])
    }

    // MARK: - Actions

    @objc private func addTapped() {
        onTap?()
    }
}
