// ARCoScanQRView.swift
// ARBoxModule — Maison Fraise
//
// UIKit overlay sheet that generates and displays a QR code so a nearby friend
// can scan the same AR anchor. Colors inverted for dark-mode legibility.
// No storyboards.

import UIKit

final class ARCoScanQRView: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted  = UIColor.white.withAlphaComponent(0.4)

    // MARK: - Callback

    var onClose: (() -> Void)?

    // MARK: - Subviews

    private let titleLabel    = UILabel()
    private let qrImageView   = UIImageView()
    private let subtitleLabel = UILabel()
    private let closeButton   = UIButton(type: .system)

    // MARK: - Init

    init(code: String) {
        super.init(frame: .zero)
        setupView()
        qrImageView.image = generateQR(from: code)
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Setup

    private func setupView() {
        backgroundColor    = bg
        layer.cornerRadius = 24
        clipsToBounds      = true

        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 250),
            heightAnchor.constraint(equalToConstant: 300)
        ])

        // Title
        titleLabel.text          = "SCAN TOGETHER"
        titleLabel.font          = .monospacedSystemFont(ofSize: 11, weight: .regular)
        titleLabel.textColor     = .white
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        // QR image view
        qrImageView.contentMode        = .scaleAspectFit
        qrImageView.backgroundColor    = .white
        qrImageView.layer.cornerRadius = 8
        qrImageView.clipsToBounds      = true
        qrImageView.translatesAutoresizingMaskIntoConstraints = false

        // Subtitle
        subtitleLabel.text          = "Hold this up for a friend to scan"
        subtitleLabel.font          = .systemFont(ofSize: 10)
        subtitleLabel.textColor     = muted
        subtitleLabel.textAlignment = .center
        subtitleLabel.numberOfLines = 1
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false

        // Close button
        closeButton.setTitle("CLOSE", for: .normal)
        closeButton.titleLabel?.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        closeButton.setTitleColor(muted, for: .normal)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)

        addSubview(titleLabel)
        addSubview(qrImageView)
        addSubview(subtitleLabel)
        addSubview(closeButton)

        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: topAnchor, constant: 16),
            titleLabel.centerXAnchor.constraint(equalTo: centerXAnchor),

            qrImageView.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 14),
            qrImageView.centerXAnchor.constraint(equalTo: centerXAnchor),
            qrImageView.widthAnchor.constraint(equalToConstant: 180),
            qrImageView.heightAnchor.constraint(equalToConstant: 180),

            subtitleLabel.topAnchor.constraint(equalTo: qrImageView.bottomAnchor, constant: 12),
            subtitleLabel.centerXAnchor.constraint(equalTo: centerXAnchor),
            subtitleLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            subtitleLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),

            closeButton.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 10),
            closeButton.centerXAnchor.constraint(equalTo: centerXAnchor),
            closeButton.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -14)
        ])
    }

    // MARK: - QR Generation

    private func generateQR(from string: String) -> UIImage? {
        guard let data   = string.data(using: .utf8),
              let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M",  forKey: "inputCorrectionLevel")
        guard let ciImage = filter.outputImage else { return nil }
        let scale  = 180.0 / ciImage.extent.width
        let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        // Invert colors for dark mode
        guard let inverted = CIFilter(
                  name: "CIColorInvert",
                  parameters: ["inputImage": scaled]
              )?.outputImage,
              let masked = CIFilter(
                  name: "CIMaskToAlpha",
                  parameters: ["inputImage": inverted]
              )?.outputImage
        else {
            return UIImage(ciImage: scaled)
        }
        return UIImage(ciImage: masked)
    }

    // MARK: - Actions

    @objc private func closeTapped() {
        onClose?()
    }
}
