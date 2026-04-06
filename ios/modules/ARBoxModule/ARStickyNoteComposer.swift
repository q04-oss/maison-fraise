// ARStickyNoteComposer.swift
// ARBoxModule — Maison Fraise
//
// Full-screen overlay for composing a new sticky note. Features a blurred
// dark background, color picker, character-limited text input, and Post/Cancel
// callbacks. animateIn() fades from alpha 0. No storyboards.

import UIKit

final class ARStickyNoteComposer: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted  = UIColor(white: 1, alpha: 0.45)

    // MARK: - Note color palette

    private struct NoteColor {
        let name: String
        let color: UIColor
    }

    private let palette: [NoteColor] = [
        NoteColor(name: "amber", color: UIColor(red: 0.99, green: 0.85, blue: 0.20, alpha: 0.95)),
        NoteColor(name: "blue",  color: UIColor(red: 0.25, green: 0.55, blue: 0.95, alpha: 0.95)),
        NoteColor(name: "green", color: UIColor(red: 0.20, green: 0.75, blue: 0.40, alpha: 0.95)),
        NoteColor(name: "red",   color: UIColor(red: 0.95, green: 0.25, blue: 0.20, alpha: 0.95))
    ]

    private var selectedColorIndex: Int = 0 {
        didSet { updateColorPicker() }
    }

    // MARK: - Callbacks

    var onPost:   ((String, String) -> Void)?
    var onCancel: (() -> Void)?

    // MARK: - Subviews

    private let blurView     = UIVisualEffectView(effect: UIBlurEffect(style: .dark))
    private let card         = UIView()
    private let headerLabel  = UILabel()
    private var colorButtons: [UIButton] = []
    private let colorStack   = UIStackView()
    private let textView     = UITextView()
    private let placeholder  = UILabel()
    private let charCounter  = UILabel()
    private let postButton   = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)

    private let maxChars = 200

    // MARK: - Init

    init() {
        super.init(frame: .zero)
        setupView()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Setup

    private func setupView() {
        // Full-screen blur backdrop
        blurView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(blurView)
        NSLayoutConstraint.activate([
            blurView.leadingAnchor.constraint(equalTo: leadingAnchor),
            blurView.trailingAnchor.constraint(equalTo: trailingAnchor),
            blurView.topAnchor.constraint(equalTo: topAnchor),
            blurView.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])

        // Tap outside card dismisses
        let backdropTap = UITapGestureRecognizer(target: self, action: #selector(cancelTapped))
        blurView.addGestureRecognizer(backdropTap)

        setupCard()
    }

    private func setupCard() {
        card.backgroundColor   = bg
        card.layer.cornerRadius = 20
        card.clipsToBounds = true
        card.translatesAutoresizingMaskIntoConstraints = false
        // Stop backdrop tap from passing through the card
        card.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(cardTapped)))
        addSubview(card)

        NSLayoutConstraint.activate([
            card.centerXAnchor.constraint(equalTo: centerXAnchor),
            card.centerYAnchor.constraint(equalTo: centerYAnchor),
            card.widthAnchor.constraint(
                lessThanOrEqualToConstant: 340
            ),
            card.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 20),
            card.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -20)
        ])
        // Prefer width = parentWidth - 40 but cap at 340
        let preferredWidth = card.widthAnchor.constraint(equalTo: widthAnchor, constant: -40)
        preferredWidth.priority = .defaultHigh
        preferredWidth.isActive = true

        // Header
        headerLabel.text      = "LEAVE A NOTE"
        headerLabel.font      = .monospacedSystemFont(ofSize: 10, weight: .bold)
        headerLabel.textColor = accent
        headerLabel.textAlignment = .center
        headerLabel.translatesAutoresizingMaskIntoConstraints = false

        // Color picker circles
        colorStack.axis         = .horizontal
        colorStack.spacing      = 12
        colorStack.alignment    = .center
        colorStack.distribution = .equalSpacing
        colorStack.translatesAutoresizingMaskIntoConstraints = false

        for (i, nc) in palette.enumerated() {
            let btn = UIButton(type: .custom)
            btn.backgroundColor = nc.color
            btn.layer.cornerRadius  = 14
            btn.clipsToBounds = true
            btn.tag = i
            btn.translatesAutoresizingMaskIntoConstraints = false
            btn.widthAnchor.constraint(equalToConstant: 28).isActive = true
            btn.heightAnchor.constraint(equalToConstant: 28).isActive = true
            btn.addTarget(self, action: #selector(colorTapped(_:)), for: .touchUpInside)
            colorStack.addArrangedSubview(btn)
            colorButtons.append(btn)
        }
        updateColorPicker()

        // Text view
        textView.backgroundColor    = UIColor(white: 1, alpha: 0.06)
        textView.textColor          = .white
        textView.font               = .systemFont(ofSize: 14)
        textView.layer.cornerRadius = 10
        textView.textContainerInset = UIEdgeInsets(top: 10, left: 8, bottom: 10, right: 8)
        textView.delegate           = self
        textView.returnKeyType      = .default
        textView.translatesAutoresizingMaskIntoConstraints = false

        // Placeholder
        placeholder.text      = "Write something for nearby visitors…"
        placeholder.font      = .systemFont(ofSize: 14)
        placeholder.textColor = muted
        placeholder.numberOfLines = 0
        placeholder.translatesAutoresizingMaskIntoConstraints = false
        placeholder.isUserInteractionEnabled = false
        textView.addSubview(placeholder)
        NSLayoutConstraint.activate([
            placeholder.leadingAnchor.constraint(equalTo: textView.leadingAnchor, constant: 13),
            placeholder.topAnchor.constraint(equalTo: textView.topAnchor, constant: 10),
            placeholder.trailingAnchor.constraint(equalTo: textView.trailingAnchor, constant: -8)
        ])

        // Character counter
        charCounter.text      = "0/200"
        charCounter.font      = .systemFont(ofSize: 9)
        charCounter.textColor = muted
        charCounter.textAlignment = .right
        charCounter.translatesAutoresizingMaskIntoConstraints = false

        // Post button
        postButton.setTitle("POST NOTE →", for: .normal)
        postButton.titleLabel?.font = .monospacedSystemFont(ofSize: 12, weight: .bold)
        postButton.setTitleColor(.black, for: .normal)
        postButton.backgroundColor    = accent
        postButton.layer.cornerRadius = 12
        postButton.translatesAutoresizingMaskIntoConstraints = false
        postButton.addTarget(self, action: #selector(postTapped), for: .touchUpInside)

        // Cancel button
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 13)
        cancelButton.setTitleColor(muted, for: .normal)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)

        card.addSubview(headerLabel)
        card.addSubview(colorStack)
        card.addSubview(textView)
        card.addSubview(charCounter)
        card.addSubview(postButton)
        card.addSubview(cancelButton)

        NSLayoutConstraint.activate([
            headerLabel.topAnchor.constraint(equalTo: card.topAnchor, constant: 20),
            headerLabel.centerXAnchor.constraint(equalTo: card.centerXAnchor),

            colorStack.topAnchor.constraint(equalTo: headerLabel.bottomAnchor, constant: 16),
            colorStack.centerXAnchor.constraint(equalTo: card.centerXAnchor),

            textView.topAnchor.constraint(equalTo: colorStack.bottomAnchor, constant: 16),
            textView.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            textView.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            textView.heightAnchor.constraint(equalToConstant: 110),

            charCounter.topAnchor.constraint(equalTo: textView.bottomAnchor, constant: 6),
            charCounter.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),

            postButton.topAnchor.constraint(equalTo: charCounter.bottomAnchor, constant: 14),
            postButton.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            postButton.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            postButton.heightAnchor.constraint(equalToConstant: 44),

            cancelButton.topAnchor.constraint(equalTo: postButton.bottomAnchor, constant: 10),
            cancelButton.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            cancelButton.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -18)
        ])
    }

    // MARK: - Color Picker

    private func updateColorPicker() {
        for (i, btn) in colorButtons.enumerated() {
            let selected = i == selectedColorIndex
            let size: CGFloat = selected ? 32 : 28
            btn.layer.cornerRadius = size / 2
            btn.layer.borderWidth  = selected ? 2.5 : 0
            btn.layer.borderColor  = UIColor.white.withAlphaComponent(0.8).cgColor
            // Resize via transform for smooth animation
            let scale = selected ? (32.0 / 28.0) : 1.0
            UIView.animate(withDuration: 0.18, delay: 0, options: .curveEaseOut) {
                btn.transform = CGAffineTransform(scaleX: scale, y: scale)
            }
        }
    }

    // MARK: - Animation

    func animateIn() {
        alpha = 0
        UIView.animate(withDuration: 0.28, delay: 0, options: .curveEaseOut) {
            self.alpha = 1
        }
    }

    // MARK: - Actions

    @objc private func colorTapped(_ sender: UIButton) {
        selectedColorIndex = sender.tag
    }

    @objc private func postTapped() {
        let text = textView.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        onPost?(text, palette[selectedColorIndex].name)
    }

    @objc private func cancelTapped() {
        onCancel?()
    }

    @objc private func cardTapped() {
        // Absorb tap so it doesn't reach backdrop
    }
}

// MARK: - UITextViewDelegate

extension ARStickyNoteComposer: UITextViewDelegate {

    func textViewDidChange(_ textView: UITextView) {
        let count = textView.text.count
        charCounter.text  = "\(count)/\(maxChars)"
        placeholder.isHidden = count > 0
    }

    func textView(
        _ textView: UITextView,
        shouldChangeTextIn range: NSRange,
        replacementText text: String
    ) -> Bool {
        let current  = textView.text ?? ""
        let newCount = current.count - range.length + text.count
        return newCount <= maxChars
    }
}
