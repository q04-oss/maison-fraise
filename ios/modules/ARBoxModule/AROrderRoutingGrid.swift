import UIKit

/// Staff-facing screen-space overlay showing today's pickup slots as a colour-segmented grid.
/// Segments are colour-coded: paid (grey), preparing (amber), ready (green).
class AROrderRoutingGrid: UIView {

  // MARK: - Public types
  struct PickupSlot {
    let slotTime: String
    let total: Int
    let paid: Int
    let preparing: Int
    let ready: Int
  }

  // MARK: - Colours
  private let accent  = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
  private let muted   = UIColor(red: 0.5,   green: 0.47,  blue: 0.44,  alpha: 1)
  private let darkBg  = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.92)
  private let green   = UIColor(red: 0.18,  green: 0.72,  blue: 0.36,  alpha: 1)
  private let greyPaid = UIColor(red: 0.35, green: 0.32,  blue: 0.30,  alpha: 1)

  // MARK: - Subviews
  private let headerLabel = UILabel()
  private let stackView   = UIStackView()

  // MARK: - Constants
  private let maxVisible = 8

  // MARK: - Init
  init() {
    super.init(frame: .zero)
    setupViews()
  }

  required init?(coder: NSCoder) { fatalError() }

  // MARK: - Setup
  private func setupViews() {
    layer.cornerRadius = 16
    layer.masksToBounds = true
    backgroundColor = darkBg

    headerLabel.text = "TODAY'S PICKUPS"
    headerLabel.font = UIFont.monospacedSystemFont(ofSize: 9, weight: .semibold)
    headerLabel.textColor = accent
    headerLabel.translatesAutoresizingMaskIntoConstraints = false
    addSubview(headerLabel)

    stackView.axis = .vertical
    stackView.spacing = 6
    stackView.alignment = .fill
    stackView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stackView)

    NSLayoutConstraint.activate([
      headerLabel.topAnchor.constraint(equalTo: topAnchor, constant: 12),
      headerLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),

      stackView.topAnchor.constraint(equalTo: headerLabel.bottomAnchor, constant: 10),
      stackView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
      stackView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
      stackView.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -12)
    ])
  }

  // MARK: - Public
  func configure(slots: [PickupSlot]) {
    // Clear old rows
    stackView.arrangedSubviews.forEach { $0.removeFromSuperview() }

    let visible = Array(slots.prefix(maxVisible))
    for slot in visible {
      stackView.addArrangedSubview(makeRow(for: slot))
    }

    if slots.count > maxVisible {
      let overflow = slots.count - maxVisible
      let moreRow = makeOverflowRow(count: overflow)
      stackView.addArrangedSubview(moreRow)
    }
  }

  // MARK: - Row builders
  private func makeRow(for slot: PickupSlot) -> UIView {
    let row = UIView()
    row.translatesAutoresizingMaskIntoConstraints = false
    row.heightAnchor.constraint(equalToConstant: 24).isActive = true

    // Time label
    let timeLabel = UILabel()
    timeLabel.text = slot.slotTime
    timeLabel.font = UIFont.monospacedSystemFont(ofSize: 10, weight: .regular)
    timeLabel.textColor = .white
    timeLabel.translatesAutoresizingMaskIntoConstraints = false
    row.addSubview(timeLabel)

    // Bar container
    let barContainer = UIView()
    barContainer.layer.cornerRadius = 3
    barContainer.clipsToBounds = true
    barContainer.backgroundColor = greyPaid.withAlphaComponent(0.15)
    barContainer.translatesAutoresizingMaskIntoConstraints = false
    row.addSubview(barContainer)

    // Total count
    let totalLabel = UILabel()
    totalLabel.text = "\(slot.total)"
    totalLabel.font = UIFont.monospacedSystemFont(ofSize: 9, weight: .regular)
    totalLabel.textColor = muted
    totalLabel.translatesAutoresizingMaskIntoConstraints = false
    row.addSubview(totalLabel)

    NSLayoutConstraint.activate([
      timeLabel.leadingAnchor.constraint(equalTo: row.leadingAnchor),
      timeLabel.centerYAnchor.constraint(equalTo: row.centerYAnchor),
      timeLabel.widthAnchor.constraint(equalToConstant: 44),

      totalLabel.trailingAnchor.constraint(equalTo: row.trailingAnchor),
      totalLabel.centerYAnchor.constraint(equalTo: row.centerYAnchor),
      totalLabel.widthAnchor.constraint(equalToConstant: 24),

      barContainer.leadingAnchor.constraint(equalTo: timeLabel.trailingAnchor, constant: 6),
      barContainer.trailingAnchor.constraint(equalTo: totalLabel.leadingAnchor, constant: -6),
      barContainer.centerYAnchor.constraint(equalTo: row.centerYAnchor),
      barContainer.heightAnchor.constraint(equalToConstant: 12)
    ])

    // Populate segments after layout pass via a deferred call
    // We use a layout subview override on a helper view instead
    let segmentHost = SegmentBarView(paid: slot.paid, preparing: slot.preparing,
                                      ready: slot.ready, total: slot.total,
                                      paidColor: greyPaid, preparingColor: accent, readyColor: green)
    segmentHost.translatesAutoresizingMaskIntoConstraints = false
    barContainer.addSubview(segmentHost)
    NSLayoutConstraint.activate([
      segmentHost.leadingAnchor.constraint(equalTo: barContainer.leadingAnchor),
      segmentHost.trailingAnchor.constraint(equalTo: barContainer.trailingAnchor),
      segmentHost.topAnchor.constraint(equalTo: barContainer.topAnchor),
      segmentHost.bottomAnchor.constraint(equalTo: barContainer.bottomAnchor)
    ])

    return row
  }

  private func makeOverflowRow(count: Int) -> UIView {
    let row = UIView()
    let label = UILabel()
    label.text = "+\(count) more"
    label.font = UIFont.monospacedSystemFont(ofSize: 9, weight: .regular)
    label.textColor = muted
    label.translatesAutoresizingMaskIntoConstraints = false
    row.addSubview(label)
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: row.leadingAnchor),
      label.topAnchor.constraint(equalTo: row.topAnchor),
      label.bottomAnchor.constraint(equalTo: row.bottomAnchor)
    ])
    return row
  }
}

// MARK: - Segment bar helper
/// Proportional 3-segment bar drawn in layoutSubviews (no draw override).
private final class SegmentBarView: UIView {
  private let paid: Int
  private let preparing: Int
  private let ready: Int
  private let total: Int
  private let paidColor: UIColor
  private let preparingColor: UIColor
  private let readyColor: UIColor

  private let paidView      = UIView()
  private let preparingView = UIView()
  private let readyView     = UIView()

  init(paid: Int, preparing: Int, ready: Int, total: Int,
       paidColor: UIColor, preparingColor: UIColor, readyColor: UIColor) {
    self.paid = paid; self.preparing = preparing; self.ready = ready; self.total = total
    self.paidColor = paidColor; self.preparingColor = preparingColor; self.readyColor = readyColor
    super.init(frame: .zero)
    [paidView, preparingView, readyView].forEach { addSubview($0) }
  }

  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard bounds.width > 0, total > 0 else { return }
    let w = bounds.width
    let h = bounds.height
    let unit = w / CGFloat(total)

    let paidW      = CGFloat(paid) * unit
    let preparingW = CGFloat(preparing) * unit
    let readyW     = CGFloat(ready) * unit

    paidView.frame      = CGRect(x: 0, y: 0, width: paidW, height: h)
    preparingView.frame = CGRect(x: paidW, y: 0, width: preparingW, height: h)
    readyView.frame     = CGRect(x: paidW + preparingW, y: 0, width: readyW, height: h)

    paidView.backgroundColor      = paidColor
    preparingView.backgroundColor = preparingColor
    readyView.backgroundColor     = readyColor
  }
}
