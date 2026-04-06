import UIKit

/// `draw(_:)` overlay showing a user's rank within their collectif,
/// with a three-column podium graphic that highlights the user's position.
class ARCollectifRankView: UIView {

  // MARK: - Private state
  private let rank: Int
  private let totalMembers: Int

  // MARK: - Colours
  private let accent  = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let muted   = UIColor(red: 0.5,   green: 0.47,  blue: 0.44,  alpha: 1)
  private let darkBg  = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.92)
  private let white   = UIColor.white

  // MARK: - Init
  init(rank: Int, totalMembers: Int) {
    self.rank         = rank
    self.totalMembers = totalMembers
    super.init(frame: .zero)
    backgroundColor = .clear
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Drawing
  override func draw(_ rect: CGRect) {
    guard let ctx = UIGraphicsGetCurrentContext() else { return }

    // Background pill
    let pillPath = UIBezierPath(roundedRect: rect, cornerRadius: 20)
    darkBg.setFill()
    pillPath.fill()

    let pad: CGFloat = 14

    // Header
    let headerFont  = UIFont.monospacedSystemFont(ofSize: 8, weight: .semibold)
    let headerAttrs: [NSAttributedString.Key: Any] = [.font: headerFont, .foregroundColor: muted]
    let headerStr = "COLLECTIF RANK" as NSString
    let headerSize = headerStr.size(withAttributes: headerAttrs)
    headerStr.draw(at: CGPoint(x: (rect.width - headerSize.width) / 2, y: pad), withAttributes: headerAttrs)

    // Rank number "#N"
    let rankFont  = UIFont.systemFont(ofSize: 32, weight: .bold)
    let rankAttrs: [NSAttributedString.Key: Any] = [.font: rankFont, .foregroundColor: white]
    let rankStr = "#\(rank)" as NSString
    let rankSize = rankStr.size(withAttributes: rankAttrs)
    rankStr.draw(at: CGPoint(x: (rect.width - rankSize.width) / 2, y: pad + 20), withAttributes: rankAttrs)

    // "of M members"
    let subFont  = UIFont.systemFont(ofSize: 12, weight: .regular)
    let subAttrs: [NSAttributedString.Key: Any] = [.font: subFont, .foregroundColor: muted]
    let subStr = "of \(totalMembers) members" as NSString
    let subSize = subStr.size(withAttributes: subAttrs)
    subStr.draw(at: CGPoint(x: (rect.width - subSize.width) / 2,
                             y: pad + 20 + rankSize.height + 4), withAttributes: subAttrs)

    // Podium graphic
    let podiumTop = pad + 20 + rankSize.height + 4 + subSize.height + 14
    drawPodium(in: rect, podiumTop: podiumTop, pad: pad, ctx: ctx)
  }

  // MARK: - Podium helper
  private func drawPodium(in rect: CGRect, podiumTop: CGFloat, pad: CGFloat, ctx: CGContext) {
    // 3 columns: positions [2nd, 1st, 3rd] visually (centre = 1st)
    let colW: CGFloat   = 28
    let gap: CGFloat    = 8
    let totalW          = colW * 3 + gap * 2
    let startX          = (rect.width - totalW) / 2
    let baselineY       = rect.height - pad

    // Heights: 1st=46, 2nd=32, 3rd=22
    let heights: [CGFloat] = [32, 46, 22]  // left=2nd, center=1st, right=3rd
    let ranks: [Int]       = [2, 1, 3]

    for i in 0..<3 {
      let x      = startX + CGFloat(i) * (colW + gap)
      let h      = heights[i]
      let colRect = CGRect(x: x, y: baselineY - h, width: colW, height: h)
      let podiumRank = ranks[i]

      let isUser: Bool
      if rank <= 3 {
        isUser = podiumRank == rank
      } else {
        isUser = false
      }

      let fillColor = isUser ? accent : muted.withAlphaComponent(0.35)
      let colPath = UIBezierPath(roundedRect: colRect, byRoundingCorners: [.topLeft, .topRight],
                                  cornerRadii: CGSize(width: 4, height: 4))
      fillColor.setFill()
      colPath.fill()

      // Rank number on column
      let numFont  = UIFont.monospacedSystemFont(ofSize: 8, weight: .bold)
      let numColor: UIColor = isUser ? .white : muted.withAlphaComponent(0.7)
      let numAttrs: [NSAttributedString.Key: Any] = [.font: numFont, .foregroundColor: numColor]
      let numStr = "\(podiumRank)" as NSString
      let numSize = numStr.size(withAttributes: numAttrs)
      numStr.draw(at: CGPoint(x: x + (colW - numSize.width) / 2,
                               y: baselineY - h - numSize.height - 2), withAttributes: numAttrs)
    }

    // If user's rank is > 3, draw a small marker below podium
    if rank > 3 {
      let noteFont  = UIFont.monospacedSystemFont(ofSize: 7, weight: .regular)
      let noteAttrs: [NSAttributedString.Key: Any] = [.font: noteFont, .foregroundColor: accent]
      let noteStr = "you are #\(rank)" as NSString
      let noteSize = noteStr.size(withAttributes: noteAttrs)
      noteStr.draw(at: CGPoint(x: (rect.width - noteSize.width) / 2,
                                y: baselineY + 4), withAttributes: noteAttrs)
    }
  }
}
