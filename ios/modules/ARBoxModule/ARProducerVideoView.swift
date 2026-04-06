import UIKit

/// Screen-space overlay card for a producer video message. Tapping fires `onPlay`.
/// If `thumbnailUrl` is provided the thumbnail is loaded asynchronously;
/// otherwise a dark placeholder with a centred play button is shown.
class ARProducerVideoView: UIView {

  // MARK: - Public callback
  var onPlay: (() -> Void)?

  // MARK: - Colours
  private let accent  = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let muted   = UIColor(red: 0.5,   green: 0.47,  blue: 0.44,  alpha: 1)
  private let darkBg  = UIColor(red: 0.10,  green: 0.09,  blue: 0.08,  alpha: 0.95)
  private let thumbBg = UIColor(red: 0.14,  green: 0.12,  blue: 0.10,  alpha: 1)

  // MARK: - Subviews
  private let thumbnailContainer = UIView()
  private let thumbnailImageView = UIImageView()
  private let playCircle         = UIView()
  private let playTriangle       = UIImageView()
  private let captionLabel       = UILabel()
  private let nameLabel          = UILabel()

  // MARK: - Data
  private let producerName: String
  private let thumbnailUrl: String?

  // MARK: - Init
  init(producerName: String, thumbnailUrl: String?) {
    self.producerName = producerName
    self.thumbnailUrl = thumbnailUrl
    super.init(frame: .zero)
    setupViews()
    loadThumbnailIfNeeded()
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Setup
  private func setupViews() {
    layer.cornerRadius = 16
    layer.masksToBounds = true
    backgroundColor = darkBg

    // Thumbnail area (top 65%)
    thumbnailContainer.backgroundColor = thumbBg
    thumbnailContainer.translatesAutoresizingMaskIntoConstraints = false
    addSubview(thumbnailContainer)

    thumbnailImageView.contentMode = .scaleAspectFill
    thumbnailImageView.clipsToBounds = true
    thumbnailImageView.translatesAutoresizingMaskIntoConstraints = false
    thumbnailContainer.addSubview(thumbnailImageView)

    // Play button: accent circle
    playCircle.backgroundColor = accent
    playCircle.layer.cornerRadius = 22
    playCircle.translatesAutoresizingMaskIntoConstraints = false
    playCircle.isUserInteractionEnabled = false
    thumbnailContainer.addSubview(playCircle)

    // Triangle (▶) via SF Symbol or Unicode fallback
    let triangleConfig = UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
    if let img = UIImage(systemName: "play.fill", withConfiguration: triangleConfig) {
      playTriangle.image = img.withRenderingMode(.alwaysTemplate)
      playTriangle.tintColor = .white
    } else {
      // Fallback: UILabel with unicode
      let fallback = UILabel()
      fallback.text = "▶"
      fallback.textColor = .white
      fallback.font = UIFont.systemFont(ofSize: 18, weight: .semibold)
      fallback.translatesAutoresizingMaskIntoConstraints = false
      playCircle.addSubview(fallback)
      NSLayoutConstraint.activate([
        fallback.centerXAnchor.constraint(equalTo: playCircle.centerXAnchor, constant: 2),
        fallback.centerYAnchor.constraint(equalTo: playCircle.centerYAnchor)
      ])
    }
    playTriangle.translatesAutoresizingMaskIntoConstraints = false
    playCircle.addSubview(playTriangle)

    // Bottom strip
    captionLabel.text = "MESSAGE FROM THE FARM"
    captionLabel.font = UIFont.monospacedSystemFont(ofSize: 8, weight: .semibold)
    captionLabel.textColor = muted
    captionLabel.translatesAutoresizingMaskIntoConstraints = false
    addSubview(captionLabel)

    nameLabel.text = producerName
    nameLabel.font = UIFont.systemFont(ofSize: 13, weight: .semibold)
    nameLabel.textColor = .white
    nameLabel.translatesAutoresizingMaskIntoConstraints = false
    addSubview(nameLabel)

    // Constraints
    NSLayoutConstraint.activate([
      thumbnailContainer.topAnchor.constraint(equalTo: topAnchor),
      thumbnailContainer.leadingAnchor.constraint(equalTo: leadingAnchor),
      thumbnailContainer.trailingAnchor.constraint(equalTo: trailingAnchor),
      thumbnailContainer.heightAnchor.constraint(equalTo: heightAnchor, multiplier: 0.65),

      thumbnailImageView.topAnchor.constraint(equalTo: thumbnailContainer.topAnchor),
      thumbnailImageView.leadingAnchor.constraint(equalTo: thumbnailContainer.leadingAnchor),
      thumbnailImageView.trailingAnchor.constraint(equalTo: thumbnailContainer.trailingAnchor),
      thumbnailImageView.bottomAnchor.constraint(equalTo: thumbnailContainer.bottomAnchor),

      playCircle.centerXAnchor.constraint(equalTo: thumbnailContainer.centerXAnchor),
      playCircle.centerYAnchor.constraint(equalTo: thumbnailContainer.centerYAnchor),
      playCircle.widthAnchor.constraint(equalToConstant: 44),
      playCircle.heightAnchor.constraint(equalToConstant: 44),

      playTriangle.centerXAnchor.constraint(equalTo: playCircle.centerXAnchor, constant: 2),
      playTriangle.centerYAnchor.constraint(equalTo: playCircle.centerYAnchor),
      playTriangle.widthAnchor.constraint(equalToConstant: 18),
      playTriangle.heightAnchor.constraint(equalToConstant: 18),

      captionLabel.topAnchor.constraint(equalTo: thumbnailContainer.bottomAnchor, constant: 10),
      captionLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),

      nameLabel.topAnchor.constraint(equalTo: captionLabel.bottomAnchor, constant: 2),
      nameLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      nameLabel.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -10)
    ])

    // Tap gesture on whole view
    let tap = UITapGestureRecognizer(target: self, action: #selector(viewTapped))
    addGestureRecognizer(tap)
  }

  // MARK: - Thumbnail loading
  private func loadThumbnailIfNeeded() {
    guard let urlStr = thumbnailUrl, let url = URL(string: urlStr) else { return }
    URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      guard let self, let data, let img = UIImage(data: data) else { return }
      DispatchQueue.main.async {
        self.thumbnailImageView.image = img
      }
    }.resume()
  }

  // MARK: - Actions
  @objc private func viewTapped() {
    onPlay?()
  }
}
