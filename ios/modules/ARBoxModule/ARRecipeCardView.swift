import UIKit

/// Cream-background recipe suggestion card with an accent left-edge stripe.
/// Renders to 300×120 pt as a UIView → texture for SCNPlane.
class ARRecipeCardView: UIView {

  private let recipeName: String?
  private let recipeDescription: String?

  private let accent    = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let bg        = UIColor(red: 0.969, green: 0.961, blue: 0.949, alpha: 0.95)
  private let darkMuted = UIColor(red: 0.5, green: 0.47, blue: 0.44, alpha: 1)
  private let darkText  = UIColor(red: 0.12, green: 0.10, blue: 0.08, alpha: 1)

  init(recipeName: String?, recipeDescription: String?) {
    self.recipeName        = recipeName
    self.recipeDescription = recipeDescription
    super.init(frame: CGRect(x: 0, y: 0, width: 300, height: 120))
    backgroundColor = .clear
    isOpaque = false
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Drawing

  override func draw(_ rect: CGRect) {
    // Background
    let bgPath = UIBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: 12)
    bg.setFill()
    bgPath.fill()

    // Left accent stripe
    let stripeW: CGFloat = 4
    let stripePadY: CGFloat = 8
    let stripePath = UIBezierPath(
      roundedRect: CGRect(x: 2, y: stripePadY, width: stripeW, height: rect.height - stripePadY * 2),
      cornerRadius: 2
    )
    accent.setFill()
    stripePath.fill()

    let contentX: CGFloat = stripeW + 10
    let contentW: CGFloat = rect.width - contentX - 12

    // MARK: No recipe fallback
    guard let name = recipeName else {
      let fallbackAttr: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 11, weight: .regular),
        .foregroundColor: darkMuted
      ]
      let msg = "No recipe for this variety yet" as NSString
      let msgSize = msg.size(withAttributes: fallbackAttr)
      msg.draw(
        at: CGPoint(x: rect.midX - msgSize.width / 2, y: rect.midY - msgSize.height / 2),
        withAttributes: fallbackAttr
      )
      return
    }

    var cursorY: CGFloat = 12

    // "RECIPE IDEA" label
    let tagAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
      .foregroundColor: darkMuted
    ]
    ("RECIPE IDEA" as NSString).draw(at: CGPoint(x: contentX, y: cursorY), withAttributes: tagAttr)
    cursorY += 14

    // Recipe name (2 lines max)
    let nameAttr: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: 17, weight: .bold),
      .foregroundColor: darkText
    ]
    let nameRect = CGRect(x: contentX, y: cursorY, width: contentW, height: 46)
    let nameParagraph = NSMutableParagraphStyle()
    nameParagraph.lineBreakMode = .byWordWrapping
    nameParagraph.maximumLineHeight = 22
    var nameFullAttr = nameAttr
    nameFullAttr[.paragraphStyle] = nameParagraph
    (name as NSString).draw(with: nameRect, options: .usesLineFragmentOrigin, attributes: nameFullAttr, context: nil)
    // Approximate 2-line height
    let usedNameH: CGFloat = 44
    cursorY += usedNameH

    // Recipe description (3 lines, truncated)
    if let desc = recipeDescription, !desc.isEmpty {
      let descParagraph = NSMutableParagraphStyle()
      descParagraph.lineBreakMode = .byTruncatingTail
      descParagraph.maximumLineHeight = 14
      let descAttr: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 10, weight: .regular),
        .foregroundColor: darkMuted,
        .paragraphStyle: descParagraph
      ]
      let descRect = CGRect(x: contentX, y: cursorY, width: contentW, height: 42)
      (desc as NSString).draw(with: descRect, options: .usesLineFragmentOrigin, attributes: descAttr, context: nil)
    }
  }
}
