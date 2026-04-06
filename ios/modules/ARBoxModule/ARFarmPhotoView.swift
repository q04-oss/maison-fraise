import UIKit

/// Screen-space UIKit overlay showing a Polaroid-style farm photograph.
/// The card frame is supplied by the caller; image is loaded async from a URL.
class ARFarmPhotoView: UIView {

  private let photoUrl: String
  private let farmName: String

  private let imageView   = UIImageView()
  private let placeholderLabel = UILabel()
  private let captionLabel     = UILabel()
  private let farmNameLabel    = UILabel()
  private let fromLabel        = UILabel()

  private let muted = UIColor(red: 0.5, green: 0.47, blue: 0.44, alpha: 1)

  init(photoUrl: String, farmName: String) {
    self.photoUrl = photoUrl
    self.farmName = farmName
    super.init(frame: .zero)
    setupCard()
    loadImage()
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Setup

  private func setupCard() {
    // Outer card appearance
    backgroundColor  = .white
    layer.cornerRadius = 4
    layer.masksToBounds = false
    transform = CGAffineTransform(rotationAngle: 0.03)

    // Shadow
    layer.shadowColor   = UIColor.black.cgColor
    layer.shadowOpacity = 0.28
    layer.shadowOffset  = CGSize(width: 0, height: 4)
    layer.shadowRadius  = 8

    // Image view (top 75%)
    imageView.contentMode  = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.backgroundColor = UIColor(red: 0.14, green: 0.12, blue: 0.10, alpha: 1)
    imageView.layer.cornerRadius = 0
    addSubview(imageView)

    // Placeholder (shown while loading)
    placeholderLabel.text      = "⛰"
    placeholderLabel.font      = UIFont.systemFont(ofSize: 22)
    placeholderLabel.textAlignment = .center
    imageView.addSubview(placeholderLabel)

    // Caption area (bottom 25%)
    fromLabel.text          = "FROM THE FARM"
    fromLabel.font          = UIFont.monospacedSystemFont(ofSize: 7, weight: .regular)
    fromLabel.textColor     = muted
    fromLabel.textAlignment = .center
    addSubview(fromLabel)

    farmNameLabel.text          = farmName
    farmNameLabel.font          = UIFont.systemFont(ofSize: 11, weight: .medium)
    farmNameLabel.textColor     = UIColor(red: 0.12, green: 0.10, blue: 0.08, alpha: 1)
    farmNameLabel.textAlignment = .center
    farmNameLabel.adjustsFontSizeToFitWidth = true
    farmNameLabel.minimumScaleFactor = 0.7
    addSubview(farmNameLabel)
  }

  // MARK: - Layout

  override func layoutSubviews() {
    super.layoutSubviews()

    let w = bounds.width
    let h = bounds.height

    let imageH  = h * 0.75
    let captionH = h - imageH

    imageView.frame = CGRect(x: 0, y: 0, width: w, height: imageH)
    placeholderLabel.frame = imageView.bounds

    let fromH: CGFloat   = 14
    let nameH: CGFloat   = 18
    let stackH           = fromH + nameH
    let stackY           = imageH + (captionH - stackH) / 2

    fromLabel.frame     = CGRect(x: 6, y: stackY, width: w - 12, height: fromH)
    farmNameLabel.frame = CGRect(x: 6, y: stackY + fromH, width: w - 12, height: nameH)
  }

  // MARK: - Async image load

  private func loadImage() {
    guard let url = URL(string: photoUrl) else { return }
    URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
      guard let self = self,
            error == nil,
            let data = data,
            let image = UIImage(data: data) else { return }
      DispatchQueue.main.async {
        self.imageView.image = image
        self.placeholderLabel.isHidden = true
      }
    }.resume()
  }
}
