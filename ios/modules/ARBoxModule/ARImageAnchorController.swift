/// ARImageAnchorController.swift
/// Adds world-surface locking to ARBoxViewController.
/// Usage: call attach(to:) from viewDidLoad, then call planeDetected(at:) when a
/// horizontal plane is detected in the renderer delegate, and confirmLock() to commit.

import ARKit
import SceneKit
import UIKit

class ARImageAnchorController: NSObject {
    weak var sceneView: ARSCNView?
    weak var parentView: UIView?

    private var lockButton: UIButton?
    private var anchorNode: SCNNode?
    private var isLocked = false
    private var detectedPlaneTransform: simd_float4x4?

    func attach(to viewController: ARBoxViewController) {
        self.sceneView = viewController.sceneView
        self.parentView = viewController.view
        addLockButton(to: viewController.view)
    }

    private func addLockButton(to view: UIView) {
        let btn = UIButton(type: .system)
        btn.setTitle("TAP TO LOCK", for: .normal)
        btn.setTitle("LOCKED ✓", for: .disabled)
        btn.titleLabel?.font = UIFont.monospacedSystemFont(ofSize: 11, weight: .semibold)
        btn.setTitleColor(.white, for: .normal)
        btn.setTitleColor(UIColor.white.withAlphaComponent(0.5), for: .disabled)
        btn.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        btn.layer.cornerRadius = 16
        btn.layer.borderWidth = 1
        btn.layer.borderColor = UIColor.white.withAlphaComponent(0.3).cgColor
        btn.contentEdgeInsets = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
        btn.alpha = 0  // hidden until plane detected
        btn.translatesAutoresizingMaskIntoConstraints = false
        btn.addTarget(self, action: #selector(lockTapped), for: .touchUpInside)
        view.addSubview(btn)
        NSLayoutConstraint.activate([
            btn.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            btn.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
        ])
        lockButton = btn
    }

    func planeDetected(at transform: simd_float4x4) {
        guard !isLocked else { return }
        detectedPlaneTransform = transform
        UIView.animate(withDuration: 0.3) { self.lockButton?.alpha = 1 }
    }

    @objc private func lockTapped() {
        guard !isLocked, let transform = detectedPlaneTransform, let sceneView = sceneView else { return }
        isLocked = true
        lockButton?.isEnabled = false

        // Create a world anchor at the detected plane position
        let anchor = ARAnchor(transform: transform)
        sceneView.session.add(anchor: anchor)

        // Create a host node for the anchor
        let host = SCNNode()
        host.simdTransform = transform
        sceneView.scene.rootNode.addChildNode(host)
        anchorNode = host

        // Re-parent all existing content nodes to the anchor node
        for child in sceneView.scene.rootNode.childNodes {
            guard child !== host else { continue }
            // Skip lights and cameras
            if child.light != nil || child.camera != nil { continue }
            let worldPos = child.worldPosition
            host.addChildNode(child)
            child.worldPosition = worldPos
        }
    }
}
