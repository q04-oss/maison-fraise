// AREarlyAccessCountdownView.swift
// ARBoxModule — Maison Fraise
//
// AR overlay showing a live countdown to an upcoming product drop.
// Three time boxes (DAYS / HRS / MIN) update every second via a Timer.
// No storyboards.

import UIKit

final class AREarlyAccessCountdownView: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted  = UIColor.white.withAlphaComponent(0.4)
    private let boxBg  = UIColor(red: 0.13,  green: 0.12,  blue: 0.10,  alpha: 1.0)

    // MARK: - Data

    private let dropsAt: Date

    // MARK: - Timer

    private var countdownTimer: Timer?

    // MARK: - Subviews

    private let comingSoonLabel = UILabel()
    private let earlyAccessLabel = UILabel()
    private let daysBox  = TimeBoxView()
    private let hrsBox   = TimeBoxView()
    private let minBox   = TimeBoxView()

    // MARK: - Init

    init(dropsAt: Date) {
        self.dropsAt = dropsAt
        super.init(frame: .zero)
        setupView()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Lifecycle

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            updateBoxes()
            countdownTimer = Timer.scheduledTimer(
                withTimeInterval: 1,
                repeats: true
            ) { [weak self] _ in
                self?.updateBoxes()
            }
        }
    }

    override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        if newWindow == nil {
            countdownTimer?.invalidate()
            countdownTimer = nil
        }
    }

    // MARK: - Setup

    private func setupView() {
        backgroundColor    = bg
        layer.cornerRadius = 18
        clipsToBounds      = true

        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 280),
            heightAnchor.constraint(equalToConstant: 90)
        ])

        // "COMING SOON" header
        comingSoonLabel.text      = "COMING SOON"
        comingSoonLabel.font      = .monospacedSystemFont(ofSize: 7, weight: .regular)
        comingSoonLabel.textColor = muted
        comingSoonLabel.textAlignment = .center
        comingSoonLabel.translatesAutoresizingMaskIntoConstraints = false

        // Time boxes
        daysBox.configure(unit: "DAYS", boxBg: boxBg, muted: muted)
        hrsBox.configure(unit: "HRS",  boxBg: boxBg, muted: muted)
        minBox.configure(unit: "MIN",  boxBg: boxBg, muted: muted)

        // Separator labels
        let sep1 = makeSeparator()
        let sep2 = makeSeparator()

        // Boxes row
        let boxRow = UIStackView(arrangedSubviews: [daysBox, sep1, hrsBox, sep2, minBox])
        boxRow.axis      = .horizontal
        boxRow.alignment = .center
        boxRow.spacing   = 4
        boxRow.translatesAutoresizingMaskIntoConstraints = false

        // "EARLY ACCESS" subtitle
        earlyAccessLabel.text      = "EARLY ACCESS"
        earlyAccessLabel.font      = .monospacedSystemFont(ofSize: 8, weight: .regular)
        earlyAccessLabel.textColor = accent
        earlyAccessLabel.textAlignment = .center
        earlyAccessLabel.translatesAutoresizingMaskIntoConstraints = false

        addSubview(comingSoonLabel)
        addSubview(boxRow)
        addSubview(earlyAccessLabel)

        NSLayoutConstraint.activate([
            comingSoonLabel.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            comingSoonLabel.centerXAnchor.constraint(equalTo: centerXAnchor),

            boxRow.topAnchor.constraint(equalTo: comingSoonLabel.bottomAnchor, constant: 6),
            boxRow.centerXAnchor.constraint(equalTo: centerXAnchor),

            earlyAccessLabel.topAnchor.constraint(equalTo: boxRow.bottomAnchor, constant: 5),
            earlyAccessLabel.centerXAnchor.constraint(equalTo: centerXAnchor)
        ])
    }

    private func makeSeparator() -> UILabel {
        let label = UILabel()
        label.text      = ":"
        label.font      = .monospacedSystemFont(ofSize: 18, weight: .regular)
        label.textColor = muted
        return label
    }

    // MARK: - Countdown Logic

    private func updateBoxes() {
        let now        = Date()
        let remaining  = max(dropsAt.timeIntervalSince(now), 0)
        let totalMins  = Int(remaining) / 60
        let totalHours = totalMins / 60
        let days       = totalHours / 24
        let hours      = totalHours % 24
        let minutes    = totalMins % 60
        daysBox.setValue(days)
        hrsBox.setValue(hours)
        minBox.setValue(minutes)
    }
}

// MARK: - TimeBoxView

private final class TimeBoxView: UIView {

    private let numberLabel = UILabel()
    private let unitLabel   = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
    }

    required init?(coder: NSCoder) { fatalError() }

    func configure(unit: String, boxBg: UIColor, muted: UIColor) {
        backgroundColor    = boxBg
        layer.cornerRadius = 8
        clipsToBounds      = true
        translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 52),
            heightAnchor.constraint(equalToConstant: 44)
        ])

        numberLabel.text          = "00"
        numberLabel.font          = .monospacedSystemFont(ofSize: 22, weight: .regular)
        numberLabel.textColor     = .white
        numberLabel.textAlignment = .center
        numberLabel.translatesAutoresizingMaskIntoConstraints = false

        unitLabel.text          = unit
        unitLabel.font          = .monospacedSystemFont(ofSize: 6, weight: .regular)
        unitLabel.textColor     = muted
        unitLabel.textAlignment = .center
        unitLabel.translatesAutoresizingMaskIntoConstraints = false

        addSubview(numberLabel)
        addSubview(unitLabel)

        NSLayoutConstraint.activate([
            numberLabel.topAnchor.constraint(equalTo: topAnchor, constant: 4),
            numberLabel.centerXAnchor.constraint(equalTo: centerXAnchor),

            unitLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -4),
            unitLabel.centerXAnchor.constraint(equalTo: centerXAnchor)
        ])
    }

    func setValue(_ value: Int) {
        numberLabel.text = String(format: "%02d", value)
    }
}
