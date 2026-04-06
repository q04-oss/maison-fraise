import UIKit

/// Screen-space overlay showing a running-streak counter with a layered UIKit flame animation.
/// The flame is built from three CAGradientLayer-backed UIViews with staggered CABasicAnimations.
class ARStreakFlameView: UIView {

  // MARK: - Private state
  private let streakWeeks: Int
  private var flameTongues: [UIView] = []

  // MARK: - Colours
  private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let muted  = UIColor(red: 0.5,   green: 0.47,  blue: 0.44,  alpha: 1)
  private let darkBg = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.88)

  // Flame colours
  private let flameOrange = UIColor(red: 0.98, green: 0.45, blue: 0.10, alpha: 1)
  private let flameAmber  = UIColor(red: 0.99, green: 0.70, blue: 0.10, alpha: 1)
  private let flameTip    = UIColor(red: 1.00, green: 0.92, blue: 0.50, alpha: 0.7)

  // MARK: - Subviews
  private let flameContainer = UIView()
  private let streakLabel    = UILabel()
  private let subtitleLabel  = UILabel()

  // MARK: - Geometry
  private let tongueW: CGFloat = 40
  private let tongueH: CGFloat = 60

  // MARK: - Init
  init(streakWeeks: Int) {
    self.streakWeeks = streakWeeks
    super.init(frame: .zero)
    setupViews()
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Setup
  private func setupViews() {
    layer.cornerRadius = 20
    layer.masksToBounds = true
    backgroundColor = darkBg

    // Flame container (fixed 80×70 so tongues overlap naturally)
    flameContainer.backgroundColor = .clear
    flameContainer.translatesAutoresizingMaskIntoConstraints = false
    addSubview(flameContainer)

    // Streak number
    streakLabel.text = "\(streakWeeks)"
    streakLabel.font = UIFont.systemFont(ofSize: 36, weight: .bold)
    streakLabel.textColor = .white
    streakLabel.textAlignment = .center
    streakLabel.translatesAutoresizingMaskIntoConstraints = false
    addSubview(streakLabel)

    // "WEEK STREAK" caption
    subtitleLabel.text = "WEEK STREAK"
    subtitleLabel.font = UIFont.monospacedSystemFont(ofSize: 9, weight: .semibold)
    subtitleLabel.textColor = accent
    subtitleLabel.textAlignment = .center
    subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
    addSubview(subtitleLabel)

    NSLayoutConstraint.activate([
      flameContainer.topAnchor.constraint(equalTo: topAnchor, constant: 16),
      flameContainer.centerXAnchor.constraint(equalTo: centerXAnchor),
      flameContainer.widthAnchor.constraint(equalToConstant: 80),
      flameContainer.heightAnchor.constraint(equalToConstant: tongueH),

      streakLabel.topAnchor.constraint(equalTo: flameContainer.bottomAnchor, constant: 8),
      streakLabel.centerXAnchor.constraint(equalTo: centerXAnchor),

      subtitleLabel.topAnchor.constraint(equalTo: streakLabel.bottomAnchor, constant: 4),
      subtitleLabel.centerXAnchor.constraint(equalTo: centerXAnchor),
      subtitleLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -16)
    ])

    buildFlameTongues()
  }

  private func buildFlameTongues() {
    // Three gradient tongue views, centred with slight horizontal offsets
    let offsets: [CGFloat] = [-14, 0, 14]
    let delays: [Double]  = [0, 0.15, 0.30]

    for (i, xOff) in offsets.enumerated() {
      let tongue = UIView()
      tongue.frame = CGRect(x: (80 - tongueW) / 2 + xOff,
                             y: 0, width: tongueW, height: tongueH)
      tongue.layer.cornerRadius = tongueW / 2
      tongue.layer.masksToBounds = true

      let grad = CAGradientLayer()
      grad.frame = tongue.bounds
      grad.colors = [flameTip.cgColor, flameAmber.cgColor, flameOrange.cgColor]
      grad.locations = [0, 0.4, 1]
      grad.startPoint = CGPoint(x: 0.5, y: 0)
      grad.endPoint   = CGPoint(x: 0.5, y: 1)
      tongue.layer.addSublayer(grad)

      flameContainer.addSubview(tongue)
      flameTongues.append(tongue)
      _ = delays[i]  // stored to keep index; used in startAnimating via enumerated
    }
  }

  // MARK: - Public
  func startAnimating() {
    let delays: [Double] = [0, 0.15, 0.30]
    for (i, tongue) in flameTongues.enumerated() {
      addFlameAnimation(to: tongue, delay: delays[i])
    }
  }

  // MARK: - Animation
  private func addFlameAnimation(to view: UIView, delay: Double) {
    // Scale animation: 0.8 → 1.2
    let scale = CABasicAnimation(keyPath: "transform.scale")
    scale.fromValue = 0.8
    scale.toValue   = 1.2
    scale.duration  = 0.55
    scale.beginTime = CACurrentMediaTime() + delay
    scale.autoreverses = true
    scale.repeatCount  = .infinity
    scale.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    view.layer.add(scale, forKey: "flameScale_\(delay)")

    // Translate Y: -8 → +4
    let translateY = CABasicAnimation(keyPath: "transform.translation.y")
    translateY.fromValue = -8
    translateY.toValue   = 4
    translateY.duration  = 0.55
    translateY.beginTime = CACurrentMediaTime() + delay
    translateY.autoreverses = true
    translateY.repeatCount  = .infinity
    translateY.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    view.layer.add(translateY, forKey: "flameTranslate_\(delay)")
  }
}
