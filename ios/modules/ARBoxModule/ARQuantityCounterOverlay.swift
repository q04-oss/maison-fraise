// ARQuantityCounterOverlay.swift
// ARBoxModule — Maison Fraise
//
// Staff-mode screen-space overlay for counting physical boxes against
// an expected order quantity. Anchors to the bottom of its container.
// No storyboards.

import UIKit

final class ARQuantityCounterOverlay: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted  = UIColor(white: 1, alpha: 0.45)
    private let successGreen = UIColor(red: 0.18, green: 0.72, blue: 0.36, alpha: 1)
    private let dangerRed    = UIColor(red: 0.95, green: 0.25, blue: 0.20, alpha: 1)

    // MARK: - Data

    private let expectedQty: Int
    private var count: Int = 0 {
        didSet { updateCountDisplay() }
    }

    // MARK: - Callback

    var onConfirm: ((Int) -> Void)?

    // MARK: - Subviews

    private let headerLabel    = UILabel()
    private let countLabel     = UILabel()
    private let expectedLabel  = UILabel()
    private let plusButton     = UIButton(type: .system)
    private let minusButton    = UIButton(type: .system)
    private let confirmButton  = UIButton(type: .system)

    private let hapticHeavy = UIImpactFeedbackGenerator(style: .heavy)
    private let hapticLight = UIImpactFeedbackGenerator(style: .light)

    // MARK: - Init

    init(expectedQty: Int) {
        self.expectedQty = expectedQty
        super.init(frame: .zero)
        setupView()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Setup

    private func setupView() {
        backgroundColor   = bg
        layer.cornerRadius = 20
        layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        clipsToBounds = true

        // Header
        headerLabel.text      = "COUNT BOXES"
        headerLabel.font      = .monospacedSystemFont(ofSize: 11, weight: .bold)
        headerLabel.textColor = accent
        headerLabel.textAlignment = .center
        headerLabel.translatesAutoresizingMaskIntoConstraints = false

        // Count display
        countLabel.text      = "0"
        countLabel.font      = .boldSystemFont(ofSize: 60)
        countLabel.textColor = .white
        countLabel.textAlignment = .center
        countLabel.translatesAutoresizingMaskIntoConstraints = false

        // Expected label
        expectedLabel.text      = "of \(expectedQty) expected"
        expectedLabel.font      = .systemFont(ofSize: 14)
        expectedLabel.textColor = muted
        expectedLabel.textAlignment = .center
        expectedLabel.translatesAutoresizingMaskIntoConstraints = false

        // Minus button
        configureCircleButton(
            minusButton,
            title: "−",
            titleColor: .white,
            background: UIColor(white: 1, alpha: 0.12),
            action: #selector(minusTapped)
        )

        // Plus button
        configureCircleButton(
            plusButton,
            title: "+",
            titleColor: .black,
            background: accent,
            action: #selector(plusTapped)
        )

        // Confirm button
        confirmButton.setTitle("CONFIRM COUNT →", for: .normal)
        confirmButton.titleLabel?.font = .monospacedSystemFont(ofSize: 12, weight: .bold)
        confirmButton.setTitleColor(.black, for: .normal)
        confirmButton.backgroundColor  = accent
        confirmButton.layer.cornerRadius = 12
        confirmButton.translatesAutoresizingMaskIntoConstraints = false
        confirmButton.addTarget(self, action: #selector(confirmTapped), for: .touchUpInside)

        addSubview(headerLabel)
        addSubview(countLabel)
        addSubview(expectedLabel)
        addSubview(minusButton)
        addSubview(plusButton)
        addSubview(confirmButton)

        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 200),

            headerLabel.topAnchor.constraint(equalTo: topAnchor, constant: 16),
            headerLabel.centerXAnchor.constraint(equalTo: centerXAnchor),

            countLabel.topAnchor.constraint(equalTo: headerLabel.bottomAnchor, constant: 6),
            countLabel.centerXAnchor.constraint(equalTo: centerXAnchor),

            expectedLabel.topAnchor.constraint(equalTo: countLabel.bottomAnchor, constant: 0),
            expectedLabel.centerXAnchor.constraint(equalTo: centerXAnchor),

            minusButton.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 28),
            minusButton.centerYAnchor.constraint(equalTo: countLabel.centerYAnchor),
            minusButton.widthAnchor.constraint(equalToConstant: 50),
            minusButton.heightAnchor.constraint(equalToConstant: 50),

            plusButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -28),
            plusButton.centerYAnchor.constraint(equalTo: countLabel.centerYAnchor),
            plusButton.widthAnchor.constraint(equalToConstant: 50),
            plusButton.heightAnchor.constraint(equalToConstant: 50),

            confirmButton.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            confirmButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            confirmButton.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -16),
            confirmButton.heightAnchor.constraint(equalToConstant: 44)
        ])

        hapticHeavy.prepare()
        hapticLight.prepare()
    }

    private func configureCircleButton(
        _ button: UIButton,
        title: String,
        titleColor: UIColor,
        background: UIColor,
        action: Selector
    ) {
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = .boldSystemFont(ofSize: 26)
        button.setTitleColor(titleColor, for: .normal)
        button.backgroundColor    = background
        button.layer.cornerRadius = 25
        button.translatesAutoresizingMaskIntoConstraints = false
        button.addTarget(self, action: action, for: .touchUpInside)
    }

    // MARK: - Count Display

    private func updateCountDisplay() {
        countLabel.text = "\(count)"

        if count > expectedQty {
            countLabel.textColor = dangerRed
        } else if count == expectedQty && count > 0 {
            flashGreen()
        } else {
            countLabel.textColor = .white
        }
    }

    private func flashGreen() {
        countLabel.textColor = successGreen
        hapticHeavy.impactOccurred()
        UIView.animate(withDuration: 0.15, animations: {
            self.countLabel.transform = CGAffineTransform(scaleX: 1.15, y: 1.15)
        }, completion: { _ in
            UIView.animate(withDuration: 0.15) {
                self.countLabel.transform = .identity
            }
        })
    }

    // MARK: - Actions

    @objc private func plusTapped() {
        count += 1
        hapticLight.impactOccurred()
    }

    @objc private func minusTapped() {
        guard count > 0 else { return }
        count -= 1
        hapticLight.impactOccurred()
    }

    @objc private func confirmTapped() {
        onConfirm?(count)
    }
}
