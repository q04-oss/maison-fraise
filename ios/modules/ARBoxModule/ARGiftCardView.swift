import UIKit

class ARGiftCardView: UIView {
  init(note: String) {
    super.init(frame: .zero)
    backgroundColor = UIColor(red: 0.969, green: 0.961, blue: 0.949, alpha: 0.94)
    layer.cornerRadius = 20
    layer.masksToBounds = true

    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 12
    stack.layoutMargins = UIEdgeInsets(top: 28, left: 28, bottom: 28, right: 28)
    stack.isLayoutMarginsRelativeArrangement = true
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: topAnchor),
      stack.leadingAnchor.constraint(equalTo: leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])

    let icon = UILabel()
    icon.text = "🍓"
    icon.font = UIFont.systemFont(ofSize: 32)
    icon.textAlignment = .center
    stack.addArrangedSubview(icon)

    let noteLabel = UILabel()
    noteLabel.text = note
    noteLabel.font = UIFont.systemFont(ofSize: 16, weight: .regular)
    noteLabel.textColor = UIColor(red: 0.13, green: 0.12, blue: 0.11, alpha: 1)
    noteLabel.numberOfLines = 4
    noteLabel.textAlignment = .center
    stack.addArrangedSubview(noteLabel)

    let revealLabel = UILabel()
    revealLabel.text = "tap to reveal your order"
    revealLabel.font = UIFont.monospacedSystemFont(ofSize: 11, weight: .regular)
    revealLabel.textColor = UIColor(red: 0.5, green: 0.47, blue: 0.44, alpha: 1)
    revealLabel.textAlignment = .center
    stack.addArrangedSubview(revealLabel)
  }

  required init?(coder: NSCoder) { fatalError() }
}
