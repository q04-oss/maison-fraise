import UIKit

class ARCardView: UIView {

  init(
    name: String,
    farm: String,
    harvestDate: String,
    quantity: Int,
    chocolate: String,
    finish: String,
    vitaminCMg: NSNumber?,
    caloriesTodayKcal: NSNumber?,
    collectifPickupsToday: NSNumber?,
    orderCount: NSNumber?,
    cardType: String,
    vendorDescription: String?,
    vendorTags: String?
  ) {
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

    if cardType == "market" {
      buildMarketCard(stack: stack, listingName: name, vendorName: farm,
                      vendorDescription: vendorDescription, vendorTags: vendorTags)
    } else {
      buildVarietyCard(stack: stack, name: name, farm: farm, harvestDate: harvestDate,
                       quantity: quantity, chocolate: chocolate, finish: finish,
                       vitaminCMg: vitaminCMg, caloriesTodayKcal: caloriesTodayKcal,
                       collectifPickupsToday: collectifPickupsToday, orderCount: orderCount)
    }
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Variety card

  private func buildVarietyCard(
    stack: UIStackView,
    name: String,
    farm: String,
    harvestDate: String,
    quantity: Int,
    chocolate: String,
    finish: String,
    vitaminCMg: NSNumber?,
    caloriesTodayKcal: NSNumber?,
    collectifPickupsToday: NSNumber?,
    orderCount: NSNumber?
  ) {
    // Variety name
    let nameLabel = makeLabel(text: name.uppercased(), size: 22, weight: .semibold,
                              color: UIColor(red: 0.13, green: 0.12, blue: 0.11, alpha: 1))
    nameLabel.numberOfLines = 1
    stack.addArrangedSubview(nameLabel)

    // Feature 5: Variety streak
    let count = orderCount?.intValue ?? 0
    if count >= 2 {
      let streakLabel = makeLabel(
        text: "\(ordinal(count)) time with this variety",
        size: 11, weight: .regular,
        color: UIColor(red: 0.5, green: 0.47, blue: 0.44, alpha: 1)
      )
      stack.addArrangedSubview(streakLabel)
    }

    // Farm + harvest
    if !farm.isEmpty || !harvestDate.isEmpty {
      let meta = [farm, harvestDate.isEmpty ? "" : "Harvested \(harvestDate)"]
        .filter { !$0.isEmpty }
        .joined(separator: "  ·  ")
      let metaLabel = makeLabel(text: meta, size: 13, weight: .regular,
                                color: UIColor(red: 0.5, green: 0.47, blue: 0.44, alpha: 1))
      stack.addArrangedSubview(metaLabel)
    }

    // Feature 3: Collectif social row
    let pickups = collectifPickupsToday?.intValue ?? 0
    if pickups > 0 {
      let collectifLabel = makeLabel(
        text: "\(pickups) other\(pickups == 1 ? "" : "s") from your collectif today",
        size: 11, weight: .regular,
        color: UIColor(red: 0.5, green: 0.47, blue: 0.44, alpha: 1)
      )
      stack.addArrangedSubview(collectifLabel)
    }

    // Divider
    let divider = UIView()
    divider.backgroundColor = UIColor(red: 0.85, green: 0.83, blue: 0.80, alpha: 1)
    divider.heightAnchor.constraint(equalToConstant: 0.5).isActive = true
    stack.addArrangedSubview(divider)

    // Last order
    if quantity > 0 {
      let orderText = "Your last order  ·  \(quantity) × \(finish.isEmpty ? chocolate : "\(chocolate) · \(finish)")"
      let orderLabel = makeLabel(text: orderText, size: 13, weight: .regular,
                                 color: UIColor(red: 0.5, green: 0.47, blue: 0.44, alpha: 1))
      stack.addArrangedSubview(orderLabel)
    }

    // Feature 1: HealthKit nutrition row
    let vitCValue = vitaminCMg?.doubleValue ?? 0
    if vitCValue > 0 {
      let dailyTarget: Double = 75
      let vitCLabel = makeLabel(
        text: "VITAMIN C TODAY  ·  \(Int(vitCValue))mg / \(Int(dailyTarget))mg",
        size: 11, weight: .regular,
        color: UIColor(red: 0.5, green: 0.47, blue: 0.44, alpha: 1)
      )
      stack.addArrangedSubview(vitCLabel)

      // Progress bar
      let barBg = UIView()
      barBg.backgroundColor = UIColor(red: 0.85, green: 0.83, blue: 0.80, alpha: 1)
      barBg.layer.cornerRadius = 2
      barBg.translatesAutoresizingMaskIntoConstraints = false
      barBg.heightAnchor.constraint(equalToConstant: 4).isActive = true

      let fillFraction = min(vitCValue / dailyTarget, 1.0)
      let fillColor = vitCValue >= 50
        ? UIColor(red: 0.22, green: 0.75, blue: 0.35, alpha: 1)
        : UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)

      let barFill = UIView()
      barFill.backgroundColor = fillColor
      barFill.layer.cornerRadius = 2
      barFill.translatesAutoresizingMaskIntoConstraints = false
      barBg.addSubview(barFill)

      // We use a wrapper so we can set proportional width after layout
      let barWrapper = UIView()
      barWrapper.translatesAutoresizingMaskIntoConstraints = false
      barWrapper.addSubview(barBg)
      NSLayoutConstraint.activate([
        barBg.topAnchor.constraint(equalTo: barWrapper.topAnchor),
        barBg.leadingAnchor.constraint(equalTo: barWrapper.leadingAnchor),
        barBg.trailingAnchor.constraint(equalTo: barWrapper.trailingAnchor),
        barBg.bottomAnchor.constraint(equalTo: barWrapper.bottomAnchor),
        barFill.topAnchor.constraint(equalTo: barBg.topAnchor),
        barFill.leadingAnchor.constraint(equalTo: barBg.leadingAnchor),
        barFill.bottomAnchor.constraint(equalTo: barBg.bottomAnchor),
        barFill.widthAnchor.constraint(equalTo: barBg.widthAnchor, multiplier: CGFloat(fillFraction)),
      ])
      stack.addArrangedSubview(barWrapper)
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

  // MARK: - Market vendor card

  private func buildMarketCard(
    stack: UIStackView,
    listingName: String,
    vendorName: String,
    vendorDescription: String?,
    vendorTags: String?
  ) {
    // Listing name (large mono)
    let nameLabel = makeLabel(text: listingName.uppercased(), size: 22, weight: .semibold,
                              color: UIColor(red: 0.13, green: 0.12, blue: 0.11, alpha: 1))
    nameLabel.numberOfLines = 1
    stack.addArrangedSubview(nameLabel)

    // Vendor name
    if !vendorName.isEmpty {
      let vendorLabel = makeLabel(text: vendorName, size: 13, weight: .regular,
                                  color: UIColor(red: 0.5, green: 0.47, blue: 0.44, alpha: 1))
      stack.addArrangedSubview(vendorLabel)
    }

    // Divider
    let divider = UIView()
    divider.backgroundColor = UIColor(red: 0.85, green: 0.83, blue: 0.80, alpha: 1)
    divider.heightAnchor.constraint(equalToConstant: 0.5).isActive = true
    stack.addArrangedSubview(divider)

    // Description (truncated to 2 lines)
    if let desc = vendorDescription, !desc.isEmpty {
      let descLabel = makeLabel(text: desc, size: 12, weight: .regular,
                                color: UIColor(red: 0.33, green: 0.31, blue: 0.28, alpha: 1))
      descLabel.numberOfLines = 2
      stack.addArrangedSubview(descLabel)
    }

    // Tags as small pills
    if let tagsString = vendorTags, !tagsString.isEmpty {
      let tags = tagsString.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
      if !tags.isEmpty {
        let tagRow = UIStackView()
        tagRow.axis = .horizontal
        tagRow.spacing = 6
        tagRow.alignment = .leading
        for tag in tags {
          let pill = makeTagPill(text: tag)
          tagRow.addArrangedSubview(pill)
        }
        stack.addArrangedSubview(tagRow)
      }
    }

    // "COLLECTED ✓" pill — green
    let pill = UIView()
    pill.backgroundColor = UIColor(red: 0.063, green: 0.725, blue: 0.506, alpha: 1)
    pill.layer.cornerRadius = 12
    let pillLabel = makeLabel(text: "COLLECTED ✓", size: 13, weight: .medium, color: .white)
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

  // MARK: - Helpers

  private func makeLabel(text: String, size: CGFloat, weight: UIFont.Weight, color: UIColor) -> UILabel {
    let label = UILabel()
    label.text = text
    label.font = UIFont.monospacedSystemFont(ofSize: size, weight: weight)
    label.textColor = color
    label.numberOfLines = 2
    return label
  }

  private func makeTagPill(text: String) -> UIView {
    let container = UIView()
    container.backgroundColor = UIColor(red: 0.85, green: 0.83, blue: 0.80, alpha: 1)
    container.layer.cornerRadius = 8
    let label = UILabel()
    label.text = text
    label.font = UIFont.monospacedSystemFont(ofSize: 10, weight: .regular)
    label.textColor = UIColor(red: 0.33, green: 0.31, blue: 0.28, alpha: 1)
    label.translatesAutoresizingMaskIntoConstraints = false
    container.addSubview(label)
    NSLayoutConstraint.activate([
      label.topAnchor.constraint(equalTo: container.topAnchor, constant: 4),
      label.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 8),
      label.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -8),
      label.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -4),
    ])
    return container
  }

  private func ordinal(_ n: Int) -> String {
    let s = ["th", "st", "nd", "rd"]
    let v = n % 100
    let idx = (v - 20) % 10 < 4 && (v - 20) % 10 >= 0 ? (v - 20) % 10 : (v < 4 ? v : 0)
    return "\(n)\(s[idx])"
  }
}
