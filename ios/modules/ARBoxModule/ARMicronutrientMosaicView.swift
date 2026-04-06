// ARMicronutrientMosaicView.swift
// 2×2 grid of micronutrient fill bars (Folate, Manganese, Potassium, Vitamin K).
// Renders at 280×130 pt for use as an SCNPlane texture.

import UIKit

class ARMicronutrientMosaicView: UIView {

    private let folate_mcg: Double?
    private let manganese_mg: Double?
    private let potassium_mg: Double?
    private let vitamin_k_mcg: Double?

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)

    // RDAs
    private let rdaFolate: Double    = 400
    private let rdaManganese: Double = 2.3
    private let rdaPotassium: Double = 4700
    private let rdaVitaminK: Double  = 120

    init(folate_mcg: Double?, manganese_mg: Double?, potassium_mg: Double?, vitamin_k_mcg: Double?) {
        self.folate_mcg    = folate_mcg
        self.manganese_mg  = manganese_mg
        self.potassium_mg  = potassium_mg
        self.vitamin_k_mcg = vitamin_k_mcg
        super.init(frame: CGRect(x: 0, y: 0, width: 280, height: 130))
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
        // Background pill
        let pill = UIBezierPath(roundedRect: rect, cornerRadius: 18)
        bg.setFill()
        pill.fill()
        UIColor.white.withAlphaComponent(0.08).setStroke()
        pill.lineWidth = 1
        pill.stroke()

        // Header
        let headerAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.4)
        ]
        ("MICRONUTRIENTS" as NSString).draw(at: CGPoint(x: 12, y: 10), withAttributes: headerAttrs)

        // Slot colors
        let yellow  = UIColor(red: 0.95, green: 0.80, blue: 0.20, alpha: 1)
        let green   = UIColor(red: 0.18, green: 0.72, blue: 0.36, alpha: 1)
        let blue    = UIColor(red: 0.31, green: 0.60, blue: 0.95, alpha: 1)
        let purple  = UIColor(red: 0.65, green: 0.35, blue: 0.90, alpha: 1)

        struct SlotInfo {
            let label: String
            let unit: String
            let value: Double?
            let rda: Double
            let color: UIColor
        }

        let slots: [SlotInfo] = [
            SlotInfo(label: "FOLATE",    unit: "mcg", value: folate_mcg,    rda: rdaFolate,    color: yellow),
            SlotInfo(label: "MANGANESE", unit: "mg",  value: manganese_mg,  rda: rdaManganese,  color: green),
            SlotInfo(label: "POTASSIUM", unit: "mg",  value: potassium_mg,  rda: rdaPotassium,  color: blue),
            SlotInfo(label: "VIT. K",    unit: "mcg", value: vitamin_k_mcg, rda: rdaVitaminK,   color: purple),
        ]

        // 2×2 grid layout
        let slotW: CGFloat = 120
        let slotH: CGFloat = 44
        let originX: CGFloat = 12
        let originY: CGFloat = 30
        let colGap: CGFloat  = 16
        let rowGap: CGFloat  = 10

        let labelFont = UIFont.monospacedSystemFont(ofSize: 7, weight: .regular)
        let valueFont = UIFont.monospacedSystemFont(ofSize: 7, weight: .medium)
        let mutedWhite = UIColor.white.withAlphaComponent(0.4)

        for (idx, slot) in slots.enumerated() {
            let col = idx % 2
            let row = idx / 2
            let sx = originX + CGFloat(col) * (slotW + colGap)
            let sy = originY + CGFloat(row) * (slotH + rowGap)

            // Dot (4pt circle)
            let dotRect = CGRect(x: sx, y: sy + 4, width: 6, height: 6)
            let dotPath = UIBezierPath(ovalIn: dotRect)
            slot.color.setFill()
            dotPath.fill()

            // Slot label
            let labelAttrs: [NSAttributedString.Key: Any] = [
                .font: labelFont,
                .foregroundColor: mutedWhite
            ]
            (slot.label as NSString).draw(at: CGPoint(x: sx + 10, y: sy + 3), withAttributes: labelAttrs)

            // Fill bar
            let barX: CGFloat = sx
            let barY: CGFloat = sy + 18
            let barW: CGFloat = 80
            let barH: CGFloat = 6

            // Track
            let trackPath = UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barW, height: barH),
                                         cornerRadius: 3)
            UIColor.white.withAlphaComponent(0.12).setFill()
            trackPath.fill()

            // Fill
            let fraction: CGFloat
            if let v = slot.value {
                fraction = CGFloat(min(v / slot.rda, 1.0))
            } else {
                fraction = 0
            }
            if fraction > 0 {
                let fillPath = UIBezierPath(roundedRect: CGRect(x: barX, y: barY,
                                                                width: barW * fraction, height: barH),
                                            cornerRadius: 3)
                slot.color.setFill()
                fillPath.fill()
            }

            // Value label
            let valueStr: String
            if let v = slot.value {
                // Format: trim trailing zeros for small decimals
                if v < 10 {
                    valueStr = String(format: "%.1f\(slot.unit)", v)
                } else {
                    valueStr = "\(Int(v))\(slot.unit)"
                }
            } else {
                valueStr = "—"
            }
            let valueAttrs: [NSAttributedString.Key: Any] = [
                .font: valueFont,
                .foregroundColor: UIColor.white.withAlphaComponent(0.75)
            ]
            (valueStr as NSString).draw(at: CGPoint(x: sx + 84, y: sy + 16), withAttributes: valueAttrs)
        }
    }
}
