import UIKit

class ARCardView: UIView {

  init(name: String, farm: String, harvestDate: String, quantity: Int, chocolate: String, finish: String) {
    super.init(frame: .zero)
    backgroundColor = UIColor(red: 0.969, green: 0.961, blue: 0.949, alpha: 0.94) // #F7F5F2
    layer.cornerRadius = 20
    layer.masksToBounds = true

    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 10
    stack.layoutMargins = UIEdgeInsets(top: 20, left: 24, bottom: 20, right: 24)
    stack.isLayoutMarginsRelativeArrangement = true
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: topAnchor),
      stack.leadingAnchor.constraint(equalTo: leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])

    // Variety name
    let nameLabel = makeLabel(text: name.uppercased(), size: 22, weight: .semibold, color: UIColor(red: 0.13, green: 0.12, blue: 0.11, alpha: 1))
    nameLabel.numberOfLines = 1
    stack.addArrangedSubview(nameLabel)

    // Farm + harvest
    if !farm.isEmpty || !harvestDate.isEmpty {
      let meta = [farm, harvestDate.isEmpty ? "" : "Harvested \(harvestDate)"]
        .filter { !$0.isEmpty }
        .joined(separator: "  ·  ")
      let metaLabel = makeLabel(text: meta, size: 13, weight: .regular, color: UIColor(red: 0.5, green: 0.47, blue: 0.44, alpha: 1))
      stack.addArrangedSubview(metaLabel)
    }

    // Divider
    let divider = UIView()
    divider.backgroundColor = UIColor(red: 0.85, green: 0.83, blue: 0.80, alpha: 1)
    divider.heightAnchor.constraint(equalToConstant: 0.5).isActive = true
    stack.addArrangedSubview(divider)

    // Last order
    if quantity > 0 {
      let orderText = "Your last order  ·  \(quantity) × \(finish.isEmpty ? chocolate : "\(chocolate) · \(finish)")"
      let orderLabel = makeLabel(text: orderText, size: 13, weight: .regular, color: UIColor(red: 0.5, green: 0.47, blue: 0.44, alpha: 1))
      stack.addArrangedSubview(orderLabel)
    }

    // Reorder pill
    let pill = UIView()
    pill.backgroundColor = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1) // accent
    pill.layer.cornerRadius = 12
    let pillLabel = makeLabel(text: "REORDER →", size: 13, weight: .medium, color: .white)
    pillLabel.textAlignment = .center
    pillLabel.translatesAutoresizingMaskIntoConstraints = false
    pill.addSubview(pillLabel)
    pill.heightAnchor.constraint(equalToConstant: 44).isActive = true
    NSLayoutConstraint.activate([
      pillLabel.centerXAnchor.constraint(equalTo: pill.centerXAnchor),
      pillLabel.centerYAnchor.constraint(equalTo: pill.centerYAnchor),
    ])
    stack.addArrangedSubview(pill)
  }

  required init?(coder: NSCoder) { fatalError() }

  private func makeLabel(text: String, size: CGFloat, weight: UIFont.Weight, color: UIColor) -> UILabel {
    let label = UILabel()
    label.text = text
    label.font = UIFont.monospacedSystemFont(ofSize: size, weight: weight)
    label.textColor = color
    label.numberOfLines = 2
    return label
  }
}
