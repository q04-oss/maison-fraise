// ARGiftRegistryView.swift
// ARBoxModule — Maison Fraise
//
// Dark card with a wish-list button that transitions through idle → loading → added
// states. onAdd fires immediately; success is assumed after 0.8 s. No storyboards.

import UIKit

final class ARGiftRegistryView: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted  = UIColor.white.withAlphaComponent(0.4)

    // MARK: - State

    private enum State {
        case idle, loading, added
    }

    private var currentState: State = .idle {
        didSet { applyState() }
    }

    // MARK: - Callback

    var onAdd: (() -> Void)?

    // MARK: - Subviews

    private let wishButton  = UIButton(type: .system)
    private let spinner     = UIActivityIndicatorView(style: .medium)

    // MARK: - Init

    init() {
        super.init(frame: .zero)
        setupView()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Setup

    private func setupView() {
        backgroundColor    = bg
        layer.cornerRadius = 16
        clipsToBounds      = true
        layer.borderWidth  = 1
        layer.borderColor  = muted.cgColor

        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 230),
            heightAnchor.constraint(equalToConstant: 60)
        ])

        // Wish-list button
        wishButton.setTitle("♡  Add to Wish List", for: .normal)
        wishButton.titleLabel?.font = .systemFont(ofSize: 14)
        wishButton.setTitleColor(muted, for: .normal)
        wishButton.translatesAutoresizingMaskIntoConstraints = false
        wishButton.addTarget(self, action: #selector(buttonTapped), for: .touchUpInside)
        addSubview(wishButton)

        // Spinner (hidden initially)
        spinner.color = muted
        spinner.hidesWhenStopped = true
        spinner.translatesAutoresizingMaskIntoConstraints = false
        addSubview(spinner)

        NSLayoutConstraint.activate([
            wishButton.leadingAnchor.constraint(equalTo: leadingAnchor),
            wishButton.trailingAnchor.constraint(equalTo: trailingAnchor),
            wishButton.topAnchor.constraint(equalTo: topAnchor),
            wishButton.bottomAnchor.constraint(equalTo: bottomAnchor),

            spinner.centerXAnchor.constraint(equalTo: centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: centerYAnchor)
        ])
    }

    // MARK: - State Management

    private func applyState() {
        switch currentState {
        case .idle:
            wishButton.isHidden = false
            wishButton.setTitle("♡  Add to Wish List", for: .normal)
            wishButton.setTitleColor(muted, for: .normal)
            spinner.stopAnimating()

        case .loading:
            wishButton.isHidden = true
            spinner.startAnimating()

        case .added:
            spinner.stopAnimating()
            wishButton.isHidden = false
            wishButton.setTitle("✓  Added to Wish List", for: .normal)
            wishButton.setTitleColor(accent, for: .normal)
        }
    }

    // MARK: - Actions

    @objc private func buttonTapped() {
        guard currentState == .idle else { return }
        currentState = .loading
        onAdd?()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.currentState = .added
        }
    }
}
