/// ARFarmPortalView.swift
/// Renders a live farm webcam feed polled at 2-second intervals.
/// Size: 320×200 pt.

import UIKit

class ARFarmPortalView: UIView {
    private let imageView = UIImageView()
    private let liveBadge = UILabel()
    private let titleLabel = UILabel()
    private var timer: Timer?
    private let webcamURL: URL

    init(webcamURL: URL) {
        self.webcamURL = webcamURL
        super.init(frame: CGRect(x: 0, y: 0, width: 320, height: 200))
        setup()
        startPolling()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        backgroundColor = UIColor(white: 0.05, alpha: 0.92)
        layer.cornerRadius = 14
        layer.masksToBounds = true

        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        imageView.backgroundColor = UIColor(white: 0.1, alpha: 1)
        imageView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(imageView)

        titleLabel.text = "FARM PORTAL"
        titleLabel.font = UIFont.monospacedSystemFont(ofSize: 9, weight: .regular)
        titleLabel.textColor = UIColor.white.withAlphaComponent(0.5)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(titleLabel)

        liveBadge.text = "● LIVE"
        liveBadge.font = UIFont.monospacedSystemFont(ofSize: 9, weight: .semibold)
        liveBadge.textColor = UIColor(red: 0.2, green: 0.9, blue: 0.4, alpha: 1)
        liveBadge.translatesAutoresizingMaskIntoConstraints = false
        addSubview(liveBadge)

        NSLayoutConstraint.activate([
            titleLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            titleLabel.topAnchor.constraint(equalTo: topAnchor, constant: 8),

            liveBadge.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            liveBadge.topAnchor.constraint(equalTo: topAnchor, constant: 8),

            imageView.leadingAnchor.constraint(equalTo: leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: trailingAnchor),
            imageView.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 6),
            imageView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])

        // Pulse animation on the live badge
        UIView.animate(withDuration: 0.8, delay: 0, options: [.autoreverse, .repeat], animations: {
            self.liveBadge.alpha = 0.3
        })
    }

    private func startPolling() {
        fetchFrame()
        timer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.fetchFrame()
        }
    }

    private func fetchFrame() {
        let url = webcamURL.appendingPathComponent("?t=\(Date().timeIntervalSince1970)", isDirectory: false)
        // Actually just use the base URL with cache-busting query param
        var comps = URLComponents(url: webcamURL, resolvingAgainstBaseURL: false) ?? URLComponents()
        comps.queryItems = (comps.queryItems ?? []) + [URLQueryItem(name: "_t", value: "\(Int(Date().timeIntervalSince1970))")]
        guard let finalURL = comps.url else { return }
        URLSession.shared.dataTask(with: finalURL) { [weak self] data, _, _ in
            guard let data = data, let img = UIImage(data: data) else { return }
            DispatchQueue.main.async { self?.imageView.image = img }
        }.resume()
    }

    func stopPolling() {
        timer?.invalidate()
        timer = nil
    }

    deinit { stopPolling() }
}
