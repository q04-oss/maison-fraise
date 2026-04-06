import UIKit

/// Full-screen overlay presented after AR dismiss, letting the user rate a variety
/// and optionally add a tasting note before saving to their journal.
class ARTastingJournalOverlay: UIView {

  // MARK: - Public callbacks
  var onSave: ((Int, String?) -> Void)?
  var onSkip: (() -> Void)?

  // MARK: - Private state
  private let varietyName: String
  private var selectedRating: Int = 0

  // MARK: - Private colours
  private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let muted  = UIColor(red: 0.5, green: 0.47, blue: 0.44, alpha: 1)
  private let cardBg = UIColor(red: 0.10, green: 0.09, blue: 0.08, alpha: 1)

  // MARK: - Subviews
  private let blurView  = UIVisualEffectView(effect: UIBlurEffect(style: .dark))
  private let card      = UIView()
  private let headerLabel  = UILabel()
  private let nameLabel    = UILabel()
  private var starButtons: [UIButton] = []
  private let notesView    = UITextView()
  private let saveButton   = UIButton(type: .system)
  private let skipButton   = UIButton(type: .system)

  // MARK: - Init
  init(varietyName: String) {
    self.varietyName = varietyName
    super.init(frame: .zero)
    setupViews()
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Layout
  private func setupViews() {
    alpha = 0

    // Full-screen blur
    addSubview(blurView)
    blurView.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      blurView.leadingAnchor.constraint(equalTo: leadingAnchor),
      blurView.trailingAnchor.constraint(equalTo: trailingAnchor),
      blurView.topAnchor.constraint(equalTo: topAnchor),
      blurView.bottomAnchor.constraint(equalTo: bottomAnchor)
    ])

    // Tap-outside-to-skip
    let tapGesture = UITapGestureRecognizer(target: self, action: #selector(blurTapped(_:)))
    blurView.addGestureRecognizer(tapGesture)

    // Card
    card.backgroundColor = cardBg
    card.layer.cornerRadius = 20
    card.layer.masksToBounds = true
    card.translatesAutoresizingMaskIntoConstraints = false
    addSubview(card)
    NSLayoutConstraint.activate([
      card.centerXAnchor.constraint(equalTo: centerXAnchor),
      card.centerYAnchor.constraint(equalTo: centerYAnchor),
      card.widthAnchor.constraint(lessThanOrEqualToConstant: 320),
      card.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 20),
      trailingAnchor.constraint(greaterThanOrEqualTo: card.trailingAnchor, constant: 20)
    ])
    let widthFit = card.widthAnchor.constraint(equalToConstant: 320)
    widthFit.priority = .defaultHigh
    widthFit.isActive = true

    // Stack inside card
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 16
    stack.alignment = .fill
    stack.translatesAutoresizingMaskIntoConstraints = false
    card.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 24),
      stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
      stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -24)
    ])

    // Header
    headerLabel.text = "RATE THIS VARIETY"
    headerLabel.font = UIFont.monospacedSystemFont(ofSize: 10, weight: .semibold)
    headerLabel.textColor = accent
    headerLabel.textAlignment = .center
    stack.addArrangedSubview(headerLabel)

    // Variety name
    nameLabel.text = varietyName
    nameLabel.font = UIFont.systemFont(ofSize: 20, weight: .bold)
    nameLabel.textColor = .white
    nameLabel.textAlignment = .center
    nameLabel.numberOfLines = 2
    stack.addArrangedSubview(nameLabel)

    // Stars
    let starRow = UIStackView()
    starRow.axis = .horizontal
    starRow.spacing = 12
    starRow.alignment = .center
    starRow.distribution = .fillEqually
    for i in 0..<5 {
      let btn = UIButton(type: .system)
      btn.setTitle("★", for: .normal)
      btn.titleLabel?.font = UIFont.systemFont(ofSize: 28)
      btn.setTitleColor(muted, for: .normal)
      btn.tag = i
      btn.addTarget(self, action: #selector(starTapped(_:)), for: .touchUpInside)
      starButtons.append(btn)
      starRow.addArrangedSubview(btn)
    }
    stack.addArrangedSubview(starRow)

    // Notes text view
    notesView.backgroundColor = UIColor(red: 0.16, green: 0.14, blue: 0.12, alpha: 1)
    notesView.textColor = .white
    notesView.font = UIFont.systemFont(ofSize: 13)
    notesView.layer.cornerRadius = 8
    notesView.textContainerInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
    notesView.isScrollEnabled = false
    notesView.heightAnchor.constraint(equalToConstant: 66).isActive = true
    // Placeholder
    notesView.text = "Add tasting notes…"
    notesView.textColor = muted
    notesView.delegate = self
    stack.addArrangedSubview(notesView)

    // Save button
    saveButton.setTitle("SAVE RATING →", for: .normal)
    saveButton.titleLabel?.font = UIFont.monospacedSystemFont(ofSize: 13, weight: .semibold)
    saveButton.setTitleColor(.white, for: .normal)
    saveButton.backgroundColor = accent
    saveButton.layer.cornerRadius = 10
    saveButton.heightAnchor.constraint(equalToConstant: 44).isActive = true
    saveButton.addTarget(self, action: #selector(saveTapped), for: .touchUpInside)
    stack.addArrangedSubview(saveButton)

    // Skip button
    skipButton.setTitle("Skip", for: .normal)
    skipButton.titleLabel?.font = UIFont.systemFont(ofSize: 13)
    skipButton.setTitleColor(muted, for: .normal)
    skipButton.addTarget(self, action: #selector(skipTapped), for: .touchUpInside)
    stack.addArrangedSubview(skipButton)
  }

  // MARK: - Public
  func animateIn() {
    UIView.animate(withDuration: 0.3, delay: 0, options: .curveEaseOut) {
      self.alpha = 1
    }
  }

  // MARK: - Actions
  @objc private func starTapped(_ sender: UIButton) {
    selectedRating = sender.tag + 1
    updateStarColors()
  }

  private func updateStarColors() {
    for (i, btn) in starButtons.enumerated() {
      btn.setTitleColor(i < selectedRating ? accent : muted, for: .normal)
    }
  }

  @objc private func saveTapped() {
    let notes: String?
    if notesView.textColor == muted || notesView.text.isEmpty {
      notes = nil
    } else {
      notes = notesView.text
    }
    onSave?(selectedRating, notes)
  }

  @objc private func skipTapped() {
    onSkip?()
  }

  @objc private func blurTapped(_ gesture: UITapGestureRecognizer) {
    let location = gesture.location(in: self)
    if !card.frame.contains(location) {
      onSkip?()
    }
  }
}

// MARK: - UITextViewDelegate (placeholder behaviour)
extension ARTastingJournalOverlay: UITextViewDelegate {
  func textViewDidBeginEditing(_ textView: UITextView) {
    if textView.textColor == muted {
      textView.text = ""
      textView.textColor = .white
    }
  }

  func textViewDidEndEditing(_ textView: UITextView) {
    if textView.text.isEmpty {
      textView.text = "Add tasting notes…"
      textView.textColor = muted
    }
  }

  func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
    // Clamp to ~3 lines (≈ 180 chars is a safe proxy)
    let current = (textView.text ?? "") as NSString
    let proposed = current.replacingCharacters(in: range, with: text)
    return proposed.count <= 200
  }
}
