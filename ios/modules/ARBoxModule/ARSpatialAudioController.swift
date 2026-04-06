/// ARSpatialAudioController.swift
/// Streams ambient farm audio and spatialises it using AVAudioEnvironmentNode.
/// Call updateListenerTransform(_:) each frame and updateSourcePosition(_:) when needed.

import AVFoundation
import SceneKit
import simd

class ARSpatialAudioController {
    private let engine = AVAudioEngine()
    private let environment = AVAudioEnvironmentNode()
    private let playerNode = AVAudioPlayerNode()
    private var audioFile: AVAudioFile?
    private var isPlaying = false

    init?(audioURL: URL) {
        engine.attach(environment)
        engine.attach(playerNode)

        // Connect player → environment → mainMixer → output
        engine.connect(playerNode, to: environment, format: nil)
        engine.connect(environment, to: engine.mainMixerNode, format: nil)

        environment.renderingAlgorithm = .HRTF
        environment.distanceAttenuationParameters.distanceAttenuationModel = .inverse
        environment.distanceAttenuationParameters.referenceDistance = 0.5
        environment.distanceAttenuationParameters.maximumDistance = 5.0
        environment.distanceAttenuationParameters.rolloffFactor = 1.0

        // Load audio asynchronously
        URLSession.shared.dataTask(with: audioURL) { [weak self] data, _, _ in
            guard let self = self, let data = data else { return }
            do {
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("ar_ambient_\(UUID().uuidString).m4a")
                try data.write(to: tempURL)
                let file = try AVAudioFile(forReading: tempURL)
                self.audioFile = file
                DispatchQueue.main.async { self.startPlayback() }
            } catch {}
        }.resume()
    }

    private func startPlayback() {
        guard let file = audioFile, !isPlaying else { return }
        do {
            try engine.start()
            playerNode.scheduleFile(file, at: nil, completionHandler: nil)
            playerNode.play()
            isPlaying = true
        } catch {}
    }

    func updateListenerTransform(_ transform: simd_float4x4) {
        // Extract position and forward vector from the camera transform
        let pos = AVAudio3DPoint(x: transform.columns.3.x,
                                  y: transform.columns.3.y,
                                  z: transform.columns.3.z)
        let fwd = AVAudio3DVector(x: -transform.columns.2.x,
                                   y: -transform.columns.2.y,
                                   z: -transform.columns.2.z)
        let up  = AVAudio3DVector(x: transform.columns.1.x,
                                   y: transform.columns.1.y,
                                   z: transform.columns.1.z)
        environment.listenerPosition = pos
        environment.listenerVectorOrientation = AVAudio3DVectorOrientation(forward: fwd, up: up)
    }

    func updateSourcePosition(_ position: SCNVector3) {
        playerNode.position = AVAudio3DPoint(x: position.x, y: position.y, z: position.z)
    }

    func stop() {
        playerNode.stop()
        engine.stop()
    }

    deinit { stop() }
}
