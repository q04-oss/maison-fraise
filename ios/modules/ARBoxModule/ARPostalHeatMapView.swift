/// ARPostalHeatMapView.swift
/// Staff-only AR overlay displaying a heat-map of customer pickup density
/// by postal code prefix. Uses MKMapSnapshotter for a real map background.
/// Size: 310×210 pt.

import UIKit
import MapKit

class ARPostalHeatMapView: UIView {

    struct PostalPoint {
        let prefix: String
        let lat: Double
        let lng: Double
        let count: Int
    }

    private let accent  = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: 1)
    private let bg      = UIColor(red: 0.08,  green: 0.07,  blue: 0.06,  alpha: 0.90)
    private let muted   = UIColor.white.withAlphaComponent(0.4)

    // Default centre: Montreal
    private static let defaultLat: Double = 45.5017
    private static let defaultLng: Double = -73.5673

    private let postalCounts: [PostalPoint]

    // Map container and snapshot image view
    private let mapContainer   = UIView()
    private let mapImageView   = UIImageView()
    private var dotViews: [UIView] = []

    // Snapshot region — stored so dots can be positioned after snapshot loads
    private var snapshotRegion: MKCoordinateRegion?

    init(postalCounts: [PostalPoint]) {
        self.postalCounts = postalCounts
        super.init(frame: CGRect(x: 0, y: 0, width: 310, height: 210))
        buildUI()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Build UI

    private func buildUI() {
        backgroundColor = bg
        layer.cornerRadius = 20
        layer.masksToBounds = true

        // Header
        let header = UILabel()
        header.text = "PICKUP DENSITY TODAY"
        header.font = UIFont.monospacedSystemFont(ofSize: 8, weight: .regular)
        header.textColor = muted
        header.translatesAutoresizingMaskIntoConstraints = false
        addSubview(header)

        // Map container (dark navy placeholder until snapshot loads)
        mapContainer.backgroundColor = UIColor(red: 0.05, green: 0.08, blue: 0.12, alpha: 1)
        mapContainer.layer.cornerRadius = 12
        mapContainer.clipsToBounds = true
        mapContainer.translatesAutoresizingMaskIntoConstraints = false
        addSubview(mapContainer)

        // Map image view fills the container
        mapImageView.contentMode = .scaleAspectFill
        mapImageView.clipsToBounds = true
        mapImageView.frame = CGRect(x: 0, y: 0, width: 280, height: 150)
        mapContainer.addSubview(mapImageView)

        // Legend
        let legend = makeLegendLabel()
        legend.translatesAutoresizingMaskIntoConstraints = false
        addSubview(legend)

        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            header.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),

            mapContainer.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 8),
            mapContainer.centerXAnchor.constraint(equalTo: centerXAnchor),
            mapContainer.widthAnchor.constraint(equalToConstant: 280),
            mapContainer.heightAnchor.constraint(equalToConstant: 150),

            legend.topAnchor.constraint(equalTo: mapContainer.bottomAnchor, constant: 7),
            legend.centerXAnchor.constraint(equalTo: centerXAnchor),
        ])
    }

    private func makeLegendLabel() -> UILabel {
        let label = UILabel()
        let base = accent

        // Build attributed string with three alpha levels
        let low  = base.withAlphaComponent(0.35)
        let med  = base.withAlphaComponent(0.65)
        let high = base.withAlphaComponent(1.0)

        let font = UIFont.monospacedSystemFont(ofSize: 7, weight: .regular)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: UIColor.white.withAlphaComponent(0.6),
        ]

        let str = NSMutableAttributedString(string: "● ", attributes: [
            .font: font, .foregroundColor: low,
        ])
        str.append(NSAttributedString(string: "LOW  ", attributes: attrs))
        str.append(NSAttributedString(string: "● ", attributes: [
            .font: font, .foregroundColor: med,
        ]))
        str.append(NSAttributedString(string: "MED  ", attributes: attrs))
        str.append(NSAttributedString(string: "● ", attributes: [
            .font: font, .foregroundColor: high,
        ]))
        str.append(NSAttributedString(string: "HIGH", attributes: attrs))

        label.attributedText = str
        return label
    }

    // MARK: - Window lifecycle

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        loadSnapshot()
    }

    // MARK: - Map snapshot

    private func loadSnapshot() {
        let avgLat: Double
        let avgLng: Double

        if postalCounts.isEmpty {
            avgLat = ARPostalHeatMapView.defaultLat
            avgLng = ARPostalHeatMapView.defaultLng
        } else {
            avgLat = postalCounts.map { $0.lat }.reduce(0, +) / Double(postalCounts.count)
            avgLng = postalCounts.map { $0.lng }.reduce(0, +) / Double(postalCounts.count)
        }

        let region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: avgLat, longitude: avgLng),
            span: MKCoordinateSpan(latitudeDelta: 0.2, longitudeDelta: 0.2)
        )
        self.snapshotRegion = region

        let options = MKMapSnapshotter.Options()
        options.region = region
        options.size   = CGSize(width: 280, height: 150)
        options.scale  = UIScreen.main.scale

        let snapshotter = MKMapSnapshotter(options: options)
        snapshotter.start { [weak self] snapshot, error in
            guard let self = self, let snapshot = snapshot, error == nil else { return }
            DispatchQueue.main.async {
                self.mapImageView.image = snapshot.image
                self.placeDots(snapshot: snapshot, region: region)
            }
        }
    }

    // MARK: - Heat dots

    private func placeDots(snapshot: MKMapSnapshotter.Snapshot, region: MKCoordinateRegion) {
        // Remove any previously placed dots
        dotViews.forEach { $0.removeFromSuperview() }
        dotViews.removeAll()

        for point in postalCounts {
            // Map coordinate to snapshot point, then position within mapContainer
            let coord = CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng)
            let snapshotPoint = snapshot.point(for: coord)

            // Guard point is within bounds
            guard snapshotPoint.x >= 0, snapshotPoint.x <= 280,
                  snapshotPoint.y >= 0, snapshotPoint.y <= 150 else { continue }

            let rawSize  = 16 + point.count * 4
            let dotSize  = CGFloat(min(max(rawSize, 16), 48))
            let alpha    = 0.6 * min(1.0, Double(point.count) / 10.0)

            let dot = UIView(frame: CGRect(
                x: snapshotPoint.x - dotSize / 2,
                y: snapshotPoint.y - dotSize / 2,
                width: dotSize,
                height: dotSize
            ))
            dot.backgroundColor = UIColor(red: 0.788, green: 0.592, blue: 0.227, alpha: CGFloat(alpha))
            dot.layer.cornerRadius = dotSize / 2
            dot.clipsToBounds = true

            let prefixLabel = UILabel(frame: dot.bounds)
            prefixLabel.text = point.prefix
            prefixLabel.font = UIFont.systemFont(ofSize: 6)
            prefixLabel.textColor = .white
            prefixLabel.textAlignment = .center
            prefixLabel.adjustsFontSizeToFitWidth = true
            dot.addSubview(prefixLabel)

            mapContainer.addSubview(dot)
            dotViews.append(dot)
        }
    }
}
