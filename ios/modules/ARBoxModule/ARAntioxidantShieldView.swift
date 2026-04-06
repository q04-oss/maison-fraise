// ARAntioxidantShieldView.swift
// UIView with an animated liquid-fill shield shape showing ORAC antioxidant value.
// Used as a UIKit overlay pinned with AutoLayout. 180×210 pt.

import UIKit

class ARAntioxidantShieldView: UIView {

    private let oracValue: Int
    private let fillRatio: Double

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)

    private let shieldLayer    = CAShapeLayer()
    private let fillLayer      = CALayer()
    private let maskLayer      = CAShapeLayer()
    private var didAnimate     = false

    init(oracValue: Int) {
        self.oracValue  = oracValue
        self.fillRatio  = min(1.0, Double(oracValue) / 100_000.0)
        super.init(frame: CGRect(x: 0, y: 0, width: 180, height: 210))
        backgroundColor = .clear
        setupLayers()
        setupLabels()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Setup

    private func shieldPath(in bounds: CGRect) -> UIBezierPath {
        // Shield: hexagonal top + pointed bottom
        // bounds assumed 180×210
        let w = bounds.width
        let h = bounds.height
        let path = UIBezierPath()
        path.move(to: CGPoint(x: 20, y: 10))
        path.addLine(to: CGPoint(x: w - 20, y: 10))
        path.addLine(to: CGPoint(x: w - 20, y: h * 0.52))
        path.addCurve(to: CGPoint(x: w / 2, y: h - 10),
                      controlPoint1: CGPoint(x: w - 20, y: h * 0.78),
                      controlPoint2: CGPoint(x: w / 2, y: h - 10))
        path.addCurve(to: CGPoint(x: 20, y: h * 0.52),
                      controlPoint1: CGPoint(x: w / 2, y: h - 10),
                      controlPoint2: CGPoint(x: 20, y: h * 0.78))
        path.close()
        return path
    }

    private func setupLayers() {
        let bounds = CGRect(x: 0, y: 0, width: 180, height: 210)

        // Shield outline layer (dark fill, border)
        shieldLayer.frame       = bounds
        shieldLayer.path        = shieldPath(in: bounds).cgPath
        shieldLayer.fillColor   = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.88).cgColor
        shieldLayer.strokeColor = UIColor(red: 0.18, green: 0.72, blue: 0.36, alpha: 0.7).cgColor
        shieldLayer.lineWidth   = 1.5
        layer.addSublayer(shieldLayer)

        // Solid fill layer, clipped to shield shape via mask
        fillLayer.frame           = bounds
        fillLayer.backgroundColor = UIColor(red: 0.2, green: 0.75, blue: 0.35, alpha: 0.8).cgColor

        // Mask fill layer to shield shape
        maskLayer.frame      = bounds
        maskLayer.path       = shieldPath(in: bounds).cgPath
        maskLayer.fillColor  = UIColor.white.cgColor
        fillLayer.mask       = maskLayer

        layer.addSublayer(fillLayer)
    }

    private func setupLabels() {
        // "ORAC" header
        let oracLabel = UILabel()
        oracLabel.text          = "ORAC"
        oracLabel.font          = UIFont.monospacedSystemFont(ofSize: 8, weight: .regular)
        oracLabel.textColor     = UIColor.white.withAlphaComponent(0.4)
        oracLabel.textAlignment = .center
        oracLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(oracLabel)

        // Value label
        let valueLabel = UILabel()
        valueLabel.text          = "\(oracValue)"
        valueLabel.font          = UIFont.monospacedSystemFont(ofSize: 22, weight: .bold)
        valueLabel.textColor     = .white
        valueLabel.textAlignment = .center
        valueLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(valueLabel)

        // "ANTIOXIDANTS" subtitle
        let subLabel = UILabel()
        subLabel.text          = "ANTIOXIDANTS"
        subLabel.font          = UIFont.monospacedSystemFont(ofSize: 7, weight: .regular)
        subLabel.textColor     = UIColor.white.withAlphaComponent(0.4)
        subLabel.textAlignment = .center
        subLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(subLabel)

        NSLayoutConstraint.activate([
            oracLabel.centerXAnchor.constraint(equalTo: centerXAnchor),
            oracLabel.topAnchor.constraint(equalTo: topAnchor, constant: 26),

            valueLabel.centerXAnchor.constraint(equalTo: centerXAnchor),
            valueLabel.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -10),

            subLabel.centerXAnchor.constraint(equalTo: centerXAnchor),
            subLabel.topAnchor.constraint(equalTo: valueLabel.bottomAnchor, constant: 4),
        ])
    }

    // MARK: - Animation

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, !didAnimate else { return }
        didAnimate = true
        animateFill()
    }

    private func animateFill() {
        let fullH = bounds.height
        let startY = fullH * CGFloat(1.0 - fillRatio)

        let anim = CABasicAnimation(keyPath: "position.y")
        anim.fromValue = startY
        anim.toValue   = 0
        anim.duration  = 1.2
        anim.timingFunction = CAMediaTimingFunction(name: .easeOut)
        anim.fillMode  = .forwards
        anim.isRemovedOnCompletion = false
        fillLayer.add(anim, forKey: "fill")
    }
}
