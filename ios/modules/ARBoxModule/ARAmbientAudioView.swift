// ARAmbientAudioView.swift
// ARBoxModule — Maison Fraise
//
// Compact card for streaming ambient farm-sound audio via AVPlayer.
// Play/pause button toggles state; three staggered equalizer CALayers
// animate while audio plays. No storyboards.

import UIKit
import AVFoundation

final class ARAmbientAudioView: UIView {

    // MARK: - Style

    private let accent = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg     = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted  = UIColor.white.withAlphaComponent(0.4)

    // MARK: - Public

    var audioURL: String? {
        didSet {
            // If currently playing, stop and reset when URL changes
            if isPlaying { stopPlayback() }
        }
    }

    // MARK: - State

    private var player:    AVPlayer?
    private var isPlaying: Bool = false {
        didSet { applyPlayingState() }
    }

    // MARK: - Subviews

    private let farmLabel    = UILabel()
    private let playButton   = UIButton(type: .custom)
    private var eqLayers:    [CALayer] = []

    // MARK: - Init

    init(audioURL: String?) {
        self.audioURL = audioURL
        super.init(frame: .zero)
        setupView()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Setup

    private func setupView() {
        backgroundColor    = bg
        layer.cornerRadius = 16
        clipsToBounds      = true

        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: 150),
            heightAnchor.constraint(equalToConstant: 65)
        ])

        // "FARM SOUNDS" label
        farmLabel.text      = "FARM SOUNDS"
        farmLabel.font      = .monospacedSystemFont(ofSize: 7, weight: .regular)
        farmLabel.textColor = muted
        farmLabel.translatesAutoresizingMaskIntoConstraints = false

        // Play/pause button
        playButton.setTitle("▶", for: .normal)
        playButton.titleLabel?.font = .systemFont(ofSize: 14)
        playButton.setTitleColor(.black, for: .normal)
        playButton.backgroundColor    = accent
        playButton.layer.cornerRadius = 18
        playButton.clipsToBounds      = true
        playButton.translatesAutoresizingMaskIntoConstraints = false
        playButton.addTarget(self, action: #selector(playTapped), for: .touchUpInside)

        addSubview(farmLabel)
        addSubview(playButton)

        NSLayoutConstraint.activate([
            farmLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            farmLabel.centerYAnchor.constraint(equalTo: centerYAnchor),

            playButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            playButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            playButton.widthAnchor.constraint(equalToConstant: 36),
            playButton.heightAnchor.constraint(equalToConstant: 36)
        ])

        setupEQBars()
    }

    private func setupEQBars() {
        // 3 bars, positioned to the left of the play button (added after layout)
        for i in 0..<3 {
            let bar        = CALayer()
            bar.backgroundColor = accent.cgColor
            bar.cornerRadius    = 1.5
            bar.isHidden        = true
            layer.addSublayer(bar)
            eqLayers.append(bar)
            // Frames are set in layoutSubviews
            let _ = i  // referenced below
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // Position EQ bars: 3 bars of 3pt width, 16pt max height, centered vertically
        // Placed between farm label and play button
        let barWidth: CGFloat  = 3
        let maxBarH: CGFloat   = 16
        let barSpacing: CGFloat = 4
        let buttonFrame        = playButton.frame
        let startX             = buttonFrame.minX - CGFloat(eqLayers.count) * (barWidth + barSpacing) - 4

        for (i, bar) in eqLayers.enumerated() {
            let x = startX + CGFloat(i) * (barWidth + barSpacing)
            bar.frame = CGRect(
                x:      x,
                y:      (bounds.height - maxBarH) / 2,
                width:  barWidth,
                height: maxBarH
            )
        }
    }

    // MARK: - EQ Animations

    private func startEQAnimations() {
        let maxH: CGFloat = 16
        let minH: CGFloat = 4

        for (i, bar) in eqLayers.enumerated() {
            bar.isHidden = false
            let anim               = CABasicAnimation(keyPath: "bounds.size.height")
            anim.fromValue         = maxH
            anim.toValue           = minH
            anim.duration          = 0.3 + Double(i) * 0.1
            anim.autoreverses      = true
            anim.repeatCount       = .infinity
            anim.timingFunction    = CAMediaTimingFunction(name: .easeInEaseOut)
            bar.add(anim, forKey: "eqBounce")
        }
    }

    private func stopEQAnimations() {
        for bar in eqLayers {
            bar.removeAllAnimations()
            bar.isHidden = true
        }
    }

    // MARK: - Playback

    @objc private func playTapped() {
        if isPlaying {
            stopPlayback()
        } else {
            startPlayback()
        }
    }

    private func startPlayback() {
        guard let urlString = audioURL,
              let url = URL(string: urlString) else { return }
        let item   = AVPlayerItem(url: url)
        player     = AVPlayer(playerItem: item)
        player?.play()
        isPlaying  = true

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playerDidFinish),
            name: .AVPlayerItemDidPlayToEndTime,
            object: item
        )
    }

    private func stopPlayback() {
        player?.pause()
        player = nil
        NotificationCenter.default.removeObserver(self, name: .AVPlayerItemDidPlayToEndTime, object: nil)
        isPlaying = false
    }

    @objc private func playerDidFinish() {
        stopPlayback()
    }

    // MARK: - State Display

    private func applyPlayingState() {
        if isPlaying {
            playButton.setTitle("■", for: .normal)
            startEQAnimations()
        } else {
            playButton.setTitle("▶", for: .normal)
            stopEQAnimations()
        }
    }

    // MARK: - Cleanup

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}
