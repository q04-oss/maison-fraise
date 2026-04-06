// ARVarietyStreakLeaderView.swift
// ARBoxModule — Maison Fraise
//
// draw(_:) leaderboard showing the top members by consecutive-week variety
// streak. Highlights the current user in accent if they appear in the list,
// or appends a "YOU: #N" row if they fall outside the top 5.
// No storyboards.

import UIKit

final class ARVarietyStreakLeaderView: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted  = UIColor.white.withAlphaComponent(0.4)

    // MARK: - Data

    private let leaders:         [(rank: Int, name: String, farmName: String, streakWeeks: Int)]
    private let currentUserRank: Int?

    // MARK: - Init

    init(
        leaders: [(rank: Int, name: String, farmName: String, streakWeeks: Int)],
        currentUserRank: Int?
    ) {
        self.leaders         = Array(leaders.prefix(5))
        self.currentUserRank = currentUserRank
        super.init(frame: CGRect(x: 0, y: 0, width: 270, height: 170))
        backgroundColor = .clear
        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 270),
            heightAnchor.constraint(equalToConstant: 170)
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Drawing

    override func draw(_ rect: CGRect) {
        // Background pill
        let pillPath = UIBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: 20)
        bg.setFill()
        pillPath.fill()

        // Header
        let headerAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
            .foregroundColor: muted
        ]
        ("STREAK LEADERS" as NSString).draw(at: CGPoint(x: 12, y: 8), withAttributes: headerAttrs)

        // Trophy top-right
        let trophyAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 16)
        ]
        let trophyStr  = "🏆" as NSString
        let trophySize = trophyStr.size(withAttributes: trophyAttrs)
        trophyStr.draw(
            at: CGPoint(x: rect.width - trophySize.width - 10, y: 4),
            withAttributes: trophyAttrs
        )

        // Rows
        let rowHeight: CGFloat = 24
        var rowY: CGFloat      = 26
        let rankX: CGFloat     = 12
        let nameX: CGFloat     = 38
        let farmX: CGFloat     = 130
        let streakX: CGFloat   = 220

        let userRankInTop5 = leaders.contains { $0.rank == currentUserRank }

        for leader in leaders {
            let isCurrentUser = leader.rank == currentUserRank
            drawRow(
                rank:        leader.rank,
                name:        leader.name,
                farmName:    leader.farmName,
                streakWeeks: leader.streakWeeks,
                highlight:   isCurrentUser,
                y:           rowY,
                rankX:       rankX,
                nameX:       nameX,
                farmX:       farmX,
                streakX:     streakX,
                rowHeight:   rowHeight,
                rect:        rect
            )
            rowY += rowHeight
        }

        // Append current-user row if outside top 5
        if let rank = currentUserRank, !userRankInTop5 {
            let youAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 10, weight: .regular),
                .foregroundColor: accent
            ]
            ("YOU: #\(rank)" as NSString).draw(at: CGPoint(x: rankX, y: rowY + 2), withAttributes: youAttrs)
        }
    }

    // MARK: - Row Helper

    private func drawRow(
        rank:        Int,
        name:        String,
        farmName:    String,
        streakWeeks: Int,
        highlight:   Bool,
        y:           CGFloat,
        rankX:       CGFloat,
        nameX:       CGFloat,
        farmX:       CGFloat,
        streakX:     CGFloat,
        rowHeight:   CGFloat,
        rect:        CGRect
    ) {
        let textColor: UIColor = highlight ? accent : .white

        // Rank
        let rankAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
            .foregroundColor: muted
        ]
        ("#\(rank)" as NSString).draw(at: CGPoint(x: rankX, y: y + 6), withAttributes: rankAttrs)

        // Name (truncated to 12 chars)
        let nameAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 10, weight: .regular),
            .foregroundColor: textColor
        ]
        let truncName = String(name.prefix(12)) as NSString
        truncName.draw(at: CGPoint(x: nameX, y: y + 5), withAttributes: nameAttrs)

        // Farm name (truncated to 10 chars)
        let farmAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
            .foregroundColor: muted
        ]
        let truncFarm = String(farmName.prefix(10)) as NSString
        truncFarm.draw(at: CGPoint(x: farmX, y: y + 6), withAttributes: farmAttrs)

        // Streak weeks + flame
        let streakAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 10, weight: .regular),
            .foregroundColor: UIColor.white
        ]
        let flameAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 10)
        ]
        let streakStr = "\(streakWeeks)w" as NSString
        streakStr.draw(at: CGPoint(x: streakX, y: y + 5), withAttributes: streakAttrs)
        let streakWidth = streakStr.size(withAttributes: streakAttrs).width
        ("🔥" as NSString).draw(at: CGPoint(x: streakX + streakWidth + 2, y: y + 5), withAttributes: flameAttrs)

        // Separator
        let sepColor = UIColor.white.withAlphaComponent(0.1)
        let sepPath  = UIBezierPath()
        sepPath.move(to: CGPoint(x: 12, y: y + rowHeight - 1))
        sepPath.addLine(to: CGPoint(x: rect.width - 12, y: y + rowHeight - 1))
        sepColor.setStroke()
        sepPath.lineWidth = 1
        sepPath.stroke()
    }
}
