// ARIrrigationDiagramView.swift
// UIView overlay with animated CAShapeLayer water flow paths for drip, rain-fed, or overhead irrigation.
// Used directly as a UIKit overlay pinned with AutoLayout. 260×110 pt.

import UIKit

class ARIrrigationDiagramView: UIView {

    private let method: String
    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)
    private let waterColor = UIColor(red: 0.4, green: 0.7, blue: 1.0, alpha: 0.8)

    private var flowLayers: [CAShapeLayer] = []
    private var didStartAnimations = false

    init(method: String) {
        self.method = method
        super.init(frame: CGRect(x: 0, y: 0, width: 260, height: 110))
        backgroundColor = .clear
        setupBackground()
        setupLabels()
        setupFlowPaths()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Setup

    private func setupBackground() {
        let bgView = UIView()
        bgView.backgroundColor          = bg
        bgView.layer.cornerRadius       = 18
        bgView.clipsToBounds            = true
        bgView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(bgView)
        NSLayoutConstraint.activate([
            bgView.leadingAnchor.constraint(equalTo: leadingAnchor),
            bgView.trailingAnchor.constraint(equalTo: trailingAnchor),
            bgView.topAnchor.constraint(equalTo: topAnchor),
            bgView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    private func setupLabels() {
        // Header
        let headerLabel = UILabel()
        headerLabel.text      = "IRRIGATION"
        headerLabel.font      = UIFont.monospacedSystemFont(ofSize: 8, weight: .regular)
        headerLabel.textColor = UIColor.white.withAlphaComponent(0.4)
        headerLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(headerLabel)

        // Method label
        let displayName: String
        switch method {
        case "drip":     displayName = "DRIP IRRIGATION"
        case "rain-fed": displayName = "RAIN-FED"
        case "overhead": displayName = "OVERHEAD SPRAY"
        default:         displayName = method.uppercased()
        }
        let methodLabel = UILabel()
        methodLabel.text      = displayName
        methodLabel.font      = UIFont.monospacedSystemFont(ofSize: 10, weight: .medium)
        methodLabel.textColor = .white
        methodLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(methodLabel)

        NSLayoutConstraint.activate([
            headerLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            headerLabel.topAnchor.constraint(equalTo: topAnchor, constant: 10),

            methodLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            methodLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10),
        ])
    }

    private func setupFlowPaths() {
        // 4 paths, staggered by index
        for i in 0..<4 {
            let shapeLayer = CAShapeLayer()
            shapeLayer.strokeColor    = waterColor.cgColor
            shapeLayer.fillColor      = UIColor.clear.cgColor
            shapeLayer.lineWidth      = 1.5
            shapeLayer.lineDashPattern = [3, 4]
            shapeLayer.strokeEnd      = 0

            let path = flowPath(index: i)
            shapeLayer.path = path.cgPath

            layer.addSublayer(shapeLayer)
            flowLayers.append(shapeLayer)
        }
    }

    private func flowPath(index: Int) -> UIBezierPath {
        // Spread 4 paths across the center zone (x: 70..220, diagram area)
        let xOffsets: [CGFloat] = [80, 120, 160, 200]
        let x = xOffsets[index]

        switch method {
        case "drip":
            // Vertical dotted paths dropping from y=20 to y=72
            let p = UIBezierPath()
            p.move(to:    CGPoint(x: x, y: 20))
            p.addLine(to: CGPoint(x: x, y: 72))
            return p

        case "rain-fed":
            // Diagonal lines top-left to bottom-right, angle ~30°
            let startX = x - 20
            let p = UIBezierPath()
            p.move(to:    CGPoint(x: startX, y: 18))
            p.addLine(to: CGPoint(x: startX + 30, y: 72))
            return p

        case "overhead":
            // Arc paths spraying outward from center top (center x=130)
            let centerX: CGFloat = 130
            let p = UIBezierPath()
            let offset = CGFloat(index - 1) * 30
            p.move(to: CGPoint(x: centerX, y: 22))
            p.addCurve(
                to:          CGPoint(x: centerX + offset + 30, y: 70),
                controlPoint1: CGPoint(x: centerX + offset * 0.3, y: 35),
                controlPoint2: CGPoint(x: centerX + offset + 20, y: 55)
            )
            return p

        default:
            let p = UIBezierPath()
            p.move(to:    CGPoint(x: x, y: 20))
            p.addLine(to: CGPoint(x: x, y: 72))
            return p
        }
    }

    // MARK: - Animation

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, !didStartAnimations else { return }
        didStartAnimations = true
        startFlowAnimations()
    }

    private func startFlowAnimations() {
        for (i, shapeLayer) in flowLayers.enumerated() {
            let anim = CABasicAnimation(keyPath: "strokeEnd")
            anim.fromValue      = 0
            anim.toValue        = 1
            anim.duration       = 1.2
            anim.beginTime      = CACurrentMediaTime() + Double(i) * 0.3
            anim.autoreverses   = true
            anim.repeatCount    = .infinity
            anim.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            shapeLayer.add(anim, forKey: "flowAnim")
        }
    }
}
