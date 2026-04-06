import UIKit

/// `draw(_:)` view showing time-at-temperature as an annotated line graph with colour-coded
/// safety zones: green (0–4°C), amber (4–8°C), red (>8°C).
class ARColdChainView: UIView {

  // MARK: - Public types
  struct ColdChainPoint {
    let hourOffset: Int
    let tempC: Double
  }

  // MARK: - Private state
  private let points: [ColdChainPoint]

  // MARK: - Colours
  private let accent   = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let muted    = UIColor(red: 0.5,   green: 0.47,  blue: 0.44,  alpha: 1)
  private let darkBg   = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.92)
  private let safeGreen  = UIColor(red: 0.18, green: 0.72, blue: 0.36, alpha: 0.15)
  private let warnAmber  = UIColor(red: 0.99, green: 0.70, blue: 0.10, alpha: 0.15)
  private let dangerRed  = UIColor(red: 0.94, green: 0.27, blue: 0.27, alpha: 0.15)
  private let dotGreen   = UIColor(red: 0.18, green: 0.72, blue: 0.36, alpha: 1)
  private let dotAmber   = UIColor(red: 0.99, green: 0.70, blue: 0.10, alpha: 1)
  private let dotRed     = UIColor(red: 0.94, green: 0.27, blue: 0.27, alpha: 1)

  // MARK: - Constants
  private let tempMin: CGFloat = 0
  private let tempMax: CGFloat = 25
  private let safeMax: CGFloat = 4
  private let warnMax: CGFloat = 8

  // MARK: - Init
  init(points: [ColdChainPoint]) {
    self.points = points
    super.init(frame: .zero)
    backgroundColor = .clear
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Drawing
  override func draw(_ rect: CGRect) {
    guard let ctx = UIGraphicsGetCurrentContext() else { return }

    // Background pill
    let pillPath = UIBezierPath(roundedRect: rect, cornerRadius: 16)
    darkBg.setFill()
    pillPath.fill()
    ctx.saveGState()
    pillPath.addClip()

    let padLeft: CGFloat  = 28
    let padRight: CGFloat = 14
    let padTop: CGFloat   = 24
    let padBottom: CGFloat = 22

    let plotX = rect.minX + padLeft
    let plotY = rect.minY + padTop
    let plotW = rect.width - padLeft - padRight
    let plotH = rect.height - padTop - padBottom

    guard plotW > 0, plotH > 0 else { ctx.restoreGState(); return }

    // Helpers
    let maxHour = CGFloat(points.map { $0.hourOffset }.max() ?? 1)
    func xFor(_ hour: Int) -> CGFloat {
      guard maxHour > 0 else { return plotX }
      return plotX + CGFloat(hour) / maxHour * plotW
    }
    func yFor(_ temp: Double) -> CGFloat {
      let clamped = min(max(temp, Double(tempMin)), Double(tempMax))
      let frac = CGFloat(clamped - Double(tempMin)) / (tempMax - tempMin)
      return plotY + plotH * (1 - frac)  // invert: higher temp = higher on screen
    }

    // Zone bands (full plot width)
    // Safe: 0–4°C
    let safeRect = CGRect(x: plotX, y: yFor(Double(safeMax)),
                           width: plotW, height: yFor(0) - yFor(Double(safeMax)))
    safeGreen.setFill()
    UIRectFill(safeRect)

    // Warning: 4–8°C
    let warnRect = CGRect(x: plotX, y: yFor(Double(warnMax)),
                           width: plotW, height: yFor(Double(safeMax)) - yFor(Double(warnMax)))
    warnAmber.setFill()
    UIRectFill(warnRect)

    // Danger: 8–25°C
    let dangerRect = CGRect(x: plotX, y: plotY,
                             width: plotW, height: yFor(Double(warnMax)) - plotY)
    dangerRed.setFill()
    UIRectFill(dangerRect)

    // Header
    let headerFont  = UIFont.monospacedSystemFont(ofSize: 8, weight: .semibold)
    let headerAttrs: [NSAttributedString.Key: Any] = [.font: headerFont, .foregroundColor: muted]
    ("COLD CHAIN" as NSString).draw(at: CGPoint(x: plotX, y: rect.minY + 7), withAttributes: headerAttrs)

    // Y-axis labels "0°" and "8°"
    let axisFont  = UIFont.monospacedSystemFont(ofSize: 7, weight: .regular)
    let axisAttrs: [NSAttributedString.Key: Any] = [.font: axisFont, .foregroundColor: muted]
    ("0°" as NSString).draw(at: CGPoint(x: rect.minX + 2, y: yFor(0) - 5), withAttributes: axisAttrs)
    ("8°" as NSString).draw(at: CGPoint(x: rect.minX + 2, y: yFor(8) - 5), withAttributes: axisAttrs)

    guard !points.isEmpty else { ctx.restoreGState(); return }

    // Temperature line
    let linePath = UIBezierPath()
    for (i, pt) in points.enumerated() {
      let p = CGPoint(x: xFor(pt.hourOffset), y: yFor(pt.tempC))
      if i == 0 { linePath.move(to: p) } else { linePath.addLine(to: p) }
    }
    UIColor.white.setStroke()
    linePath.lineWidth = 1.5
    linePath.lineCapStyle = .round
    linePath.lineJoinStyle = .round
    linePath.stroke()

    // Data dots
    for pt in points {
      let center = CGPoint(x: xFor(pt.hourOffset), y: yFor(pt.tempC))
      let dotR: CGFloat = 3
      let dotRect = CGRect(x: center.x - dotR, y: center.y - dotR, width: dotR * 2, height: dotR * 2)
      let dotPath = UIBezierPath(ovalIn: dotRect)
      let dotColor: UIColor
      if pt.tempC > 8 { dotColor = dotRed }
      else if pt.tempC > 4 { dotColor = dotAmber }
      else { dotColor = dotGreen }
      dotColor.setFill()
      dotPath.fill()
    }

    // X axis labels: "0h" and max hour
    let xAxisAttrs: [NSAttributedString.Key: Any] = [.font: axisFont, .foregroundColor: muted]
    let firstHour = points.first.map { $0.hourOffset } ?? 0
    let lastHour  = points.last.map  { $0.hourOffset } ?? 0
    let firstLabel = "\(firstHour)h" as NSString
    let lastLabel  = "\(lastHour)h"  as NSString
    firstLabel.draw(at: CGPoint(x: plotX, y: plotY + plotH + 4), withAttributes: xAxisAttrs)
    let lastSize = (lastLabel as NSString).size(withAttributes: xAxisAttrs)
    (lastLabel as NSString).draw(at: CGPoint(x: plotX + plotW - lastSize.width,
                                               y: plotY + plotH + 4), withAttributes: xAxisAttrs)

    ctx.restoreGState()
  }
}
