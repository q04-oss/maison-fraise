/// ARUnboxingAnimator.swift
/// Triggers a one-shot floating-strawberry animation when the user first scans a box.
/// Adds 6 SCNNode spheres (red, teardrop-shaped via SCNSphere with flattened z scale)
/// that float upward from below the main card and disperse, then fade and remove.

import SceneKit
import UIKit

class ARUnboxingAnimator {

    static func animate(in scene: SCNScene) {
        let strawberryRed = UIColor(red: 0.82, green: 0.12, blue: 0.12, alpha: 1)

        for i in 0..<6 {
            let radius = Float.random(in: 0.015...0.025)
            let sphere = SCNSphere(radius: CGFloat(radius))

            let material = SCNMaterial()
            material.diffuse.contents = strawberryRed
            material.lightingModel = .phong
            sphere.materials = [material]

            let node = SCNNode(geometry: sphere)

            // Flatten z scale to give a teardrop-like squished look
            node.scale = SCNVector3(1.0, 1.2, 0.6)

            let startX = Float.random(in: -0.12...0.12)
            let startY: Float = -0.18
            let startZ: Float = -0.55
            node.position = SCNVector3(startX, startY, startZ)

            scene.rootNode.addChildNode(node)

            // Random x drift for natural dispersion
            let driftX = Float.random(in: -0.08...0.08)
            let endPosition = SCNVector3(startX + driftX, startY + 0.28, startZ)

            let moveUp = SCNAction.move(to: endPosition, duration: 1.4)
            moveUp.timingMode = .easeOut

            let fadeOut = SCNAction.fadeOut(duration: 0.5)
            let remove = SCNAction.removeFromParentNode()

            let sequence = SCNAction.sequence([moveUp, fadeOut, remove])

            let staggerDelay = SCNAction.wait(duration: Double(i) * 0.08)
            let staggeredSequence = SCNAction.sequence([staggerDelay, sequence])

            node.runAction(staggeredSequence)
        }
    }
}
