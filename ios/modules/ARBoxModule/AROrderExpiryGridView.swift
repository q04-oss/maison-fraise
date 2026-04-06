/// AROrderExpiryGridView.swift
/// Staff-only AR overlay displaying a live grid of orders sorted by pickup slot time.
/// Rows are color-coded by time remaining: green >2h, amber 1–2h, red <1h.
/// Size: 320×290 pt.

import UIKit

class AROrderExpiryGridView: UIView {

    struct ExpiryOrder {
        let id: Int
        let customerName: String  // single character initial
        let slotTime: Date
    }

    var onSelect: ((Int) -> Void)?

    private let accent  = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg      = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted   = UIColor.white.withAlphaComponent(0.4)

    private let orders: [ExpiryOrder]

    init(orders: [ExpiryOrder]) {
        self.orders = orders
        super.init(frame: CGRect(x: 0, y: 0, width: 320, height: 290))
        buildUI()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Build

    private func buildUI() {
        backgroundColor = bg
        layer.cornerRadius = 20
        layer.masksToBounds = true

        // Header
        let header = UILabel()
        header.text = "ORDER EXPIRY GRID"
        header.font = UIFont.monospacedSystemFont(ofSize: 8, weight: .regular)
        header.textColor = muted
        header.translatesAutoresizingMaskIntoConstraints = false
        addSubview(header)
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
        ])

        // Scroll view
        let scrollView = UIScrollView()
        scrollView.showsVerticalScrollIndicator = false
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(scrollView)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 8),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])

        // Stack inside scroll
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 2
        stack.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: scrollView.topAnchor, constant: 4),
            stack.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor, constant: 8),
            stack.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor, constant: -8),
            stack.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor, constant: -8),
            stack.widthAnchor.constraint(equalTo: scrollView.widthAnchor, constant: -16),
        ])

        if orders.isEmpty {
            let emptyLabel = UILabel()
            emptyLabel.text = "No active orders"
            emptyLabel.font = UIFont.monospacedSystemFont(ofSize: 11, weight: .regular)
            emptyLabel.textColor = muted
            emptyLabel.textAlignment = .center
            stack.addArrangedSubview(emptyLabel)
        } else {
            for order in orders {
                let row = makeRow(for: order)
                stack.addArrangedSubview(row)
                row.heightAnchor.constraint(equalToConstant: 40).isActive = true
            }
        }
    }

    // MARK: - Row

    private func makeRow(for order: ExpiryOrder) -> UIView {
        let now = Date()
        let secondsLeft = order.slotTime.timeIntervalSince(now)
        let hoursLeft = secondsLeft / 3600

        let rowBg: UIColor
        if hoursLeft > 2 {
            rowBg = UIColor(red: 0.1,  green: 0.4, blue: 0.15, alpha: 0.6)
        } else if hoursLeft >= 1 {
            rowBg = UIColor(red: 0.45, green: 0.35, blue: 0.05, alpha: 0.6)
        } else {
            rowBg = UIColor(red: 0.5,  green: 0.1, blue: 0.1,  alpha: 0.6)
        }

        let row = UIView()
        row.backgroundColor = rowBg
        row.layer.cornerRadius = 8
        row.clipsToBounds = true
        row.translatesAutoresizingMaskIntoConstraints = false

        // Order ID — last 4 digits
        let idStr = String(format: "…%04d", order.id % 10_000)
        let idLabel = UILabel()
        idLabel.text = idStr
        idLabel.font = UIFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        idLabel.textColor = .white
        idLabel.translatesAutoresizingMaskIntoConstraints = false

        // Customer initial circle
        let circle = UIView()
        circle.backgroundColor = accent.withAlphaComponent(0.7)
        circle.layer.cornerRadius = 13
        circle.translatesAutoresizingMaskIntoConstraints = false

        let initialLabel = UILabel()
        initialLabel.text = String(order.customerName.prefix(1)).uppercased()
        initialLabel.font = UIFont.monospacedSystemFont(ofSize: 11, weight: .medium)
        initialLabel.textColor = .white
        initialLabel.textAlignment = .center
        initialLabel.translatesAutoresizingMaskIntoConstraints = false
        circle.addSubview(initialLabel)

        // Time remaining label
        let timeLabel = UILabel()
        timeLabel.text = formatTimeRemaining(seconds: max(0, secondsLeft))
        timeLabel.font = UIFont.monospacedSystemFont(ofSize: 10, weight: .regular)
        timeLabel.textColor = .white
        timeLabel.textAlignment = .right
        timeLabel.translatesAutoresizingMaskIntoConstraints = false

        row.addSubview(idLabel)
        row.addSubview(circle)
        row.addSubview(timeLabel)

        NSLayoutConstraint.activate([
            // ID label — left
            idLabel.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 10),
            idLabel.centerYAnchor.constraint(equalTo: row.centerYAnchor),

            // Circle — center
            circle.centerXAnchor.constraint(equalTo: row.centerXAnchor),
            circle.centerYAnchor.constraint(equalTo: row.centerYAnchor),
            circle.widthAnchor.constraint(equalToConstant: 26),
            circle.heightAnchor.constraint(equalToConstant: 26),

            // Initial inside circle
            initialLabel.centerXAnchor.constraint(equalTo: circle.centerXAnchor),
            initialLabel.centerYAnchor.constraint(equalTo: circle.centerYAnchor),

            // Time label — right
            timeLabel.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -10),
            timeLabel.centerYAnchor.constraint(equalTo: row.centerYAnchor),
        ])

        // Tap gesture
        let tap = UITapGestureRecognizer(target: self, action: #selector(rowTapped(_:)))
        row.addGestureRecognizer(tap)
        row.tag = order.id

        return row
    }

    // MARK: - Tap handler

    @objc private func rowTapped(_ gesture: UITapGestureRecognizer) {
        guard let view = gesture.view else { return }
        onSelect?(view.tag)
    }

    // MARK: - Helpers

    private func formatTimeRemaining(seconds: TimeInterval) -> String {
        let totalMinutes = Int(seconds / 60)
        if totalMinutes < 60 {
            return "\(totalMinutes)m"
        }
        let h = totalMinutes / 60
        let m = totalMinutes % 60
        return "\(h) h \(m) m"
    }
}
