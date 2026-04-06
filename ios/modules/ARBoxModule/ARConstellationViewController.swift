/// ARConstellationViewController.swift
/// Full UIViewController with a plain SCNView (no ARKit, no camera feed) displaying
/// the user's ordered strawberry varieties as a navigable star constellation.
/// Stars are sized by order count and positioned on a hemisphere using the Fibonacci
/// sphere algorithm keyed on the variety name hash for determinism.

import UIKit
import SceneKit

struct ConstellationStar {
    let varietyName: String
    let orderCount: Int
    let isCurrentVariety: Bool
}

class ARConstellationViewController: UIViewController {

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg = UIColor(red: 0.08, green: 0.07, blue: 0.06, alpha: 0.90)
    private let sceneBg = UIColor(red: 0.04, green: 0.03, blue: 0.06, alpha: 1)

    private let stars: [ConstellationStar]
    private let currentVarietyName: String

    private var scnView: SCNView!
    private var sceneRootNode: SCNNode!

    private var lastPanTranslation: CGPoint = .zero

    init(stars: [ConstellationStar], currentVarietyName: String) {
        self.stars = stars
        self.currentVarietyName = currentVarietyName
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = sceneBg
        setupSceneView()
        setupScene()
        setupUI()
        setupGestures()
    }

    // MARK: - Setup

    private func setupSceneView() {
        scnView = SCNView(frame: view.bounds)
        scnView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scnView.backgroundColor = sceneBg
        scnView.allowsCameraControl = false
        scnView.antialiasingMode = .multisampling4X
        view.addSubview(scnView)
    }

    private func setupScene() {
        let scene = SCNScene()
        scnView.scene = scene

        // Root node for rotation
        sceneRootNode = SCNNode()
        scene.rootNode.addChildNode(sceneRootNode)

        // Ambient light
        let ambientLight = SCNLight()
        ambientLight.type = .ambient
        ambientLight.color = UIColor(white: 0.25, alpha: 1)
        let ambientNode = SCNNode()
        ambientNode.light = ambientLight
        scene.rootNode.addChildNode(ambientNode)

        // Omni light
        let omniLight = SCNLight()
        omniLight.type = .omni
        omniLight.color = UIColor(white: 0.85, alpha: 1)
        let omniNode = SCNNode()
        omniNode.light = omniLight
        omniNode.position = SCNVector3(0, 0.5, 0.8)
        scene.rootNode.addChildNode(omniNode)

        // Camera
        let camera = SCNCamera()
        camera.fieldOfView = 70
        let cameraNode = SCNNode()
        cameraNode.camera = camera
        cameraNode.position = SCNVector3(0, 0, 0)
        // Look towards -Z (into the hemisphere)
        cameraNode.eulerAngles = SCNVector3(0, 0, 0)
        scene.rootNode.addChildNode(cameraNode)

        // Stars
        let total = max(stars.count, 1)
        for (index, star) in stars.enumerated() {
            addStarNode(star: star, index: index, total: total)
        }
    }

    private func addStarNode(star: ConstellationStar, index: Int, total: Int) {
        // Fibonacci sphere: deterministic position from index, but offset by hash
        let hashOffset = abs(star.varietyName.hashValue) % max(total, 1)
        let adjustedIndex = (index + hashOffset) % max(total, 1)

        let hemisphereRadius: Float = 0.6
        let position = fibonacciHemispherePoint(index: adjustedIndex, total: max(total, 1), radius: hemisphereRadius)

        // Radius based on order count
        let normalizedOrders = Float(min(star.orderCount, 10)) / 10.0
        let sphereRadius = 0.004 + 0.003 * normalizedOrders

        let sphere = SCNSphere(radius: CGFloat(sphereRadius))
        let material = SCNMaterial()
        material.diffuse.contents = star.isCurrentVariety
            ? accent
            : UIColor.white.withAlphaComponent(0.7)
        material.lightingModel = .phong
        sphere.materials = [material]

        let starNode = SCNNode(geometry: sphere)
        starNode.position = position
        sceneRootNode.addChildNode(starNode)

        // Glow effect for current variety
        if star.isCurrentVariety {
            let glowSphere = SCNSphere(radius: CGFloat(sphereRadius * 2.5))
            let glowMat = SCNMaterial()
            glowMat.diffuse.contents = accent.withAlphaComponent(0.15)
            glowMat.isDoubleSided = true
            glowSphere.materials = [glowMat]
            let glowNode = SCNNode(geometry: glowSphere)
            starNode.addChildNode(glowNode)
        }

        // SCNText label below the star
        let displayName = String(star.varietyName.prefix(8))
        let text = SCNText(string: displayName, extrusionDepth: 0)
        text.font = UIFont.systemFont(ofSize: 2)
        let textMat = SCNMaterial()
        textMat.diffuse.contents = UIColor.white.withAlphaComponent(0.5)
        text.materials = [textMat]

        let textNode = SCNNode(geometry: text)
        // Scale down — SCNText font size is in scene units
        textNode.scale = SCNVector3(0.003, 0.003, 0.003)

        // Center the text node beneath the star
        let (minBound, maxBound) = textNode.boundingBox
        let textWidth = (maxBound.x - minBound.x) * 0.003
        textNode.position = SCNVector3(-textWidth / 2, -Float(sphereRadius) - 0.012, 0)
        // Billboard: face camera
        let constraint = SCNBillboardConstraint()
        constraint.freeAxes = .Y
        textNode.constraints = [constraint]

        starNode.addChildNode(textNode)
    }

    /// Fibonacci sphere algorithm projected onto the front hemisphere (z < 0).
    private func fibonacciHemispherePoint(index: Int, total: Int, radius: Float) -> SCNVector3 {
        let goldenRatio: Float = (1 + sqrt(5)) / 2
        let i = Float(index)
        let n = Float(total)

        let theta = 2 * Float.pi * i / goldenRatio
        // Map to front hemisphere: phi from 0 (north pole) to π/2 (equator)
        let phi = acos(1 - (i / n) * 1.0) // 0 to ~π for full sphere

        // Clamp to front hemisphere (z < 0)
        let clampedPhi = min(phi, Float.pi / 2)

        let x = radius * sin(clampedPhi) * cos(theta)
        let y = radius * sin(clampedPhi) * sin(theta)
        let z = -radius * cos(clampedPhi) // negative z = forward

        return SCNVector3(x, y, z)
    }

    private func setupUI() {
        // Title label
        let titleLabel = UILabel()
        titleLabel.text = "MY UNIVERSE"
        titleLabel.font = .monospacedSystemFont(ofSize: 12, weight: .bold)
        titleLabel.textColor = accent
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(titleLabel)

        // Close button
        let closeButton = UIButton(type: .system)
        closeButton.setTitle("CLOSE", for: .normal)
        closeButton.titleLabel?.font = .monospacedSystemFont(ofSize: 11, weight: .semibold)
        closeButton.setTitleColor(accent, for: .normal)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        view.addSubview(closeButton)

        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 14),
            titleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 10),
            closeButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20)
        ])
    }

    private func setupGestures() {
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        scnView.addGestureRecognizer(pan)
    }

    // MARK: - Actions

    @objc private func closeTapped() {
        dismiss(animated: true)
    }

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        let translation = gesture.translation(in: scnView)

        if gesture.state == .changed {
            let dx = Float(translation.x - lastPanTranslation.x) * 0.005
            let dy = Float(translation.y - lastPanTranslation.y) * 0.005

            sceneRootNode.eulerAngles.y += dx
            sceneRootNode.eulerAngles.x += dy
        }

        lastPanTranslation = gesture.state == .ended ? .zero : translation
    }
}
