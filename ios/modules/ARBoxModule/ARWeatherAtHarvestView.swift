import UIKit

/// Displays weather conditions recorded at harvest time: condition emoji, temperature, humidity.
/// Renders to 280×100 pt as a UIView → texture for SCNPlane.
class ARWeatherAtHarvestView: UIView {

  private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let bg     = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)
  private let muted  = UIColor(white: 1.0, alpha: 0.40)

  // Parsed data
  private let conditionEmoji: String
  private let conditionLabel: String
  private let tempC: Double?
  private let humidityPct: Int?
  private let isParseable: Bool

  init(harvestWeatherJson: String?) {
    var emoji      = "🌤"
    var label      = ""
    var temp: Double?  = nil
    var hum: Int?      = nil
    var parseable      = false

    if let jsonStr = harvestWeatherJson,
       let data = jsonStr.data(using: .utf8),
       let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {

      parseable = true

      let condition = obj["condition"] as? String ?? ""
      label = condition.capitalized
      switch condition {
      case "sunny":         emoji = "☀️"
      case "partly_cloudy": emoji = "⛅"
      case "cloudy":        emoji = "☁️"
      case "rain":          emoji = "🌧"
      case "storm":         emoji = "⛈"
      default:              emoji = "🌤"
      }

      temp = obj["temp_c"] as? Double
      hum  = obj["humidity_pct"] as? Int
    }

    conditionEmoji = emoji
    conditionLabel = label
    tempC          = temp
    humidityPct    = hum
    isParseable    = parseable

    super.init(frame: CGRect(x: 0, y: 0, width: 280, height: 100))
    backgroundColor = .clear
    isOpaque = false
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Drawing

  override func draw(_ rect: CGRect) {
    // Background pill
    let bgPath = UIBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: rect.height / 2 - 1)
    bg.setFill()
    bgPath.fill()

    guard isParseable else {
      let attr: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 10, weight: .regular),
        .foregroundColor: muted
      ]
      let msg = "Weather data unavailable" as NSString
      let sz  = msg.size(withAttributes: attr)
      msg.draw(at: CGPoint(x: rect.midX - sz.width / 2, y: rect.midY - sz.height / 2), withAttributes: attr)
      return
    }

    let padX: CGFloat = 18

    // Header
    let headerAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedSystemFont(ofSize: 7, weight: .regular),
      .foregroundColor: muted
    ]
    ("WEATHER AT HARVEST" as NSString).draw(at: CGPoint(x: padX, y: 12), withAttributes: headerAttr)

    // Large emoji
    let emojiAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: 32)
    ]
    let emojiStr  = conditionEmoji as NSString
    let emojiSize = emojiStr.size(withAttributes: emojiAttr)
    let emojiX    = padX
    let emojiY: CGFloat = 30
    emojiStr.draw(at: CGPoint(x: emojiX, y: emojiY), withAttributes: emojiAttr)

    // Right column: temperature + humidity
    let rightX = emojiX + emojiSize.width + 14

    if let temp = tempC {
      let tempStr  = NSString(format: "%.0f°C", temp)
      let tempAttr: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 18, weight: .bold),
        .foregroundColor: UIColor.white
      ]
      tempStr.draw(at: CGPoint(x: rightX, y: emojiY + 2), withAttributes: tempAttr)
      let tempSize = tempStr.size(withAttributes: tempAttr)

      if let hum = humidityPct {
        let humStr  = "\(hum)% humidity" as NSString
        let humAttr: [NSAttributedString.Key: Any] = [
          .font: UIFont.systemFont(ofSize: 10, weight: .regular),
          .foregroundColor: muted
        ]
        humStr.draw(at: CGPoint(x: rightX, y: emojiY + 2 + tempSize.height + 2), withAttributes: humAttr)
      }
    }

    // Condition label (below emoji)
    if !conditionLabel.isEmpty {
      let condAttr: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 9, weight: .regular),
        .foregroundColor: accent
      ]
      let condStr  = conditionLabel as NSString
      let condSize = condStr.size(withAttributes: condAttr)
      let condY    = emojiY + emojiSize.height + 4
      condStr.draw(at: CGPoint(x: emojiX + (emojiSize.width - condSize.width) / 2, y: condY), withAttributes: condAttr)
    }
  }
}
