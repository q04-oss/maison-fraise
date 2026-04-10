import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, G, Ellipse, Defs, ClipPath, Rect } from 'react-native-svg';
import { fonts } from '../theme';
import { composeTokenName } from '../lib/tokenAlgorithm';

export interface TokenVisualProps {
  tokenId: number;
  size: number;         // visual_size 1–100
  color: string;        // visual_color hex
  seeds: number;        // visual_seeds
  irregularity: number; // visual_irregularity
  width?: number;       // render width in pixels, default 120
  tokenType?: 'standard' | 'chocolate'; // new
  partnerName?: string | null; // new
}

function interpolateChocolateColor(size: number): string {
  // size 1–100 → #8B4513 (milk) to #1a0a00 (near black)
  const t = Math.max(0, Math.min(1, (size - 1) / 99));
  const r = Math.round(0x8B + t * (0x1a - 0x8B));
  const g = Math.round(0x45 + t * (0x0a - 0x45));
  const b = Math.round(0x13 + t * (0x00 - 0x13));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function buildChocolateDipPath(
  cx: number,
  dipTopY: number,
  dipBottomY: number,
  halfWidth: number,
): string {
  // Rounded top edge — a soft wavy bezier that looks like the dip line
  const waveAmp = halfWidth * 0.08;
  return [
    `M ${cx - halfWidth} ${dipBottomY}`,
    `L ${cx - halfWidth} ${dipTopY + waveAmp}`,
    `C ${cx - halfWidth * 0.5} ${dipTopY - waveAmp}, ${cx + halfWidth * 0.5} ${dipTopY + waveAmp * 1.5}, ${cx + halfWidth} ${dipTopY + waveAmp * 0.3}`,
    `L ${cx + halfWidth} ${dipBottomY}`,
    'Z',
  ].join(' ');
}

// Simple seeded random: returns 0..1
function seededRand(seed: number): number {
  return ((seed * 9301 + 49297) % 233280) / 233280;
}

// Generate a sequence of seeded random values
function makeRandSeq(baseSeed: number) {
  let counter = baseSeed * 137;
  return () => {
    counter = (counter * 9301 + 49297) % 233280;
    return counter / 233280;
  };
}

function buildStrawberryPath(
  cx: number,
  cy: number,
  bodyW: number,
  bodyH: number,
  irregularity: number,
  tokenId: number
): string {
  const rand = makeRandSeq(tokenId + 3);
  // irregularity: 0 = perfectly smooth, 1 = very wobbly
  const irr = (irregularity / 100) * 0.18;

  const jitter = (base: number) => base + (rand() - 0.5) * 2 * irr * Math.min(bodyW, bodyH);

  // The strawberry is defined as:
  // Start at top-center, curve down-left to left-side, down to bottom-tip,
  // then up-right to right-side, curve back to top-center
  // It's like two cubic bezier curves meeting at the bottom point

  const topY = cy - bodyH * 0.1;
  const bottomY = cy + bodyH * 0.85;
  const leftX = cx - bodyW * 0.5;
  const rightX = cx + bodyW * 0.5;
  const midX = cx;

  // Left curve: top-center → left → bottom
  const cp1x = jitter(leftX - bodyW * 0.05);
  const cp1y = jitter(topY - bodyH * 0.1);
  const cp2x = jitter(leftX);
  const cp2y = jitter(cy + bodyH * 0.4);

  // Right curve: bottom → right → top-center
  const cp3x = jitter(rightX);
  const cp3y = jitter(cy + bodyH * 0.4);
  const cp4x = jitter(rightX - bodyW * 0.05);
  const cp4y = jitter(topY - bodyH * 0.1);

  return [
    `M ${midX} ${topY}`,
    `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${midX} ${bottomY}`,
    `C ${cp3x} ${cp3y}, ${cp4x} ${cp4y}, ${midX} ${topY}`,
    'Z',
  ].join(' ');
}

function buildLeafPath(cx: number, cy: number, leafSize: number): string {
  const baseY = cy;
  const tipY = cy - leafSize;
  const spread = leafSize * 0.7;
  return [
    `M ${cx} ${baseY}`,
    `Q ${cx - spread} ${baseY - leafSize * 0.5} ${cx - spread * 0.5} ${tipY}`,
    `Q ${cx} ${baseY - leafSize * 0.2} ${cx + spread * 0.5} ${tipY}`,
    `Q ${cx + spread} ${baseY - leafSize * 0.5} ${cx} ${baseY}`,
    'Z',
  ].join(' ');
}

interface SeedDot {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotation: number;
}

function generateSeeds(
  cx: number,
  cy: number,
  bodyW: number,
  bodyH: number,
  seedCount: number,
  tokenId: number
): SeedDot[] {
  const rand = makeRandSeq(tokenId + 7);
  const dots: SeedDot[] = [];
  // Use rejection sampling inside an ellipse that approximates the strawberry body
  const maxAttempts = seedCount * 20;
  let placed = 0;
  for (let i = 0; i < maxAttempts && placed < seedCount; i++) {
    // Sample within a bounding ellipse slightly smaller than the body
    const angle = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()); // uniform in circle
    const px = cx + r * Math.cos(angle) * bodyW * 0.42;
    const py = cy + bodyH * 0.1 + r * Math.sin(angle) * bodyH * 0.38;

    // Rough check: is point inside the strawberry body ellipse?
    const nx = (px - cx) / (bodyW * 0.48);
    const ny = (py - (cy + bodyH * 0.15)) / (bodyH * 0.45);
    if (nx * nx + ny * ny > 0.85) continue;

    const seedRx = bodyW * 0.018 + rand() * bodyW * 0.012;
    const seedRy = seedRx * 1.7;
    const rotation = rand() * 360;
    dots.push({ x: px, y: py, rx: seedRx, ry: seedRy, rotation });
    placed++;
  }
  return dots;
}

export function TokenVisual({
  tokenId,
  size,
  color,
  seeds,
  irregularity,
  width = 120,
  tokenType,
}: TokenVisualProps) {
  // Scale everything based on `size` (1–100) and render `width`
  const scale = 0.4 + (size / 100) * 0.6; // 0.4 to 1.0
  const viewSize = width;
  const cx = viewSize / 2;
  // Center the strawberry slightly above mid, leaving room for leaf on top
  const cy = viewSize * 0.52;
  const bodyW = viewSize * 0.55 * scale;
  const bodyH = viewSize * 0.6 * scale;
  const leafSize = bodyH * 0.22;
  const leafTopY = cy - bodyH * 0.1; // top of the body

  const bodyPath = buildStrawberryPath(cx, cy, bodyW, bodyH, irregularity, tokenId);
  const leafPath = buildLeafPath(cx, leafTopY, leafSize);

  // For chocolate mode, seeds only appear above the dip line
  const isChocolate = tokenType === 'chocolate';
  const dipFraction = 0.35; // bottom 35% is dipped
  const bodyTopY = cy - bodyH * 0.1;
  const bodyBottomY = cy + bodyH * 0.85;
  const dipTopY = bodyTopY + (bodyBottomY - bodyTopY) * (1 - dipFraction);
  const chocolateDipPath = buildChocolateDipPath(cx, dipTopY, bodyBottomY + 4, bodyW * 0.52);

  // Seeds: if chocolate, restrict to above dip line
  const allSeeds = generateSeeds(cx, cy, bodyW, bodyH, Math.min(seeds, 80), tokenId);
  const seedDots = isChocolate
    ? allSeeds.filter(dot => dot.y < dipTopY - dot.ry)
    : allSeeds;

  // Subtle highlight ellipse at top-left of body
  const hlCx = cx - bodyW * 0.18;
  const hlCy = cy - bodyH * 0.08;
  const hlRx = bodyW * 0.12;
  const hlRy = bodyH * 0.1;

  const chocolateColor = isChocolate ? interpolateChocolateColor(size) : '#8B4513';
  const clipId = `berry-clip-${tokenId}`;

  return (
    <Svg width={viewSize} height={viewSize} viewBox={`0 0 ${viewSize} ${viewSize}`}>
      {isChocolate && (
        <Defs>
          <ClipPath id={clipId}>
            <Path d={bodyPath} />
          </ClipPath>
        </Defs>
      )}
      {/* Body */}
      <Path d={bodyPath} fill={color} />
      {/* Chocolate dip overlay (clipped to berry shape) */}
      {isChocolate && (
        <Path
          d={chocolateDipPath}
          fill={chocolateColor}
          clipPath={`url(#${clipId})`}
        />
      )}
      {/* Leaf */}
      <Path d={leafPath} fill="#4CAF50" opacity={0.65} />
      {/* Seeds */}
      <G>
        {seedDots.map((dot, idx) => (
          <Ellipse
            key={idx}
            cx={dot.x}
            cy={dot.y}
            rx={dot.rx}
            ry={dot.ry}
            rotation={dot.rotation}
            origin={`${dot.x}, ${dot.y}`}
            fill="#7B1C1C"
            opacity={0.55}
          />
        ))}
      </G>
      {/* Highlight */}
      <Ellipse
        cx={hlCx}
        cy={hlCy}
        rx={hlRx}
        ry={hlRy}
        fill="white"
        opacity={0.3}
      />
    </Svg>
  );
}

export interface TokenCardData {
  tokenId: number;
  tokenNumber: string;   // e.g. "0042"
  varietyName: string;   // e.g. "ALBION"
  amountCents: number;   // excess amount in cents
  date: string;          // ISO date "2026-03-18"
  originalOwner: string; // username e.g. "lucien"
  // token visual props
  size: number;
  color: string;
  seeds: number;
  irregularity: number;
  // new
  tokenType?: 'standard' | 'chocolate';
  partnerName?: string | null;
  locationType?: string | null;
}

interface TokenCardProps {
  data: TokenCardData;
  small?: boolean;
  onPress?: () => void;
}

import { TouchableOpacity } from 'react-native';

export function TokenCard({ data, small, onPress }: TokenCardProps) {
  const cardWidth = small ? 140 : 160;
  const visualWidth = small ? 80 : 100;

  const formattedAmount = `CA$${(data.amountCents / 100).toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const displayName = composeTokenName({
    token_type: data.tokenType,
    location_type: data.locationType,
    partner_name: data.partnerName,
    variety_name: data.varietyName,
  });

  const content = (
    <View style={[
      styles.card,
      { width: cardWidth, borderColor: '#E5E1DA' },
      small && styles.cardSmall,
    ]}>
      <View style={styles.visualWrapper}>
        <TokenVisual
          tokenId={data.tokenId}
          size={data.size}
          color={data.color}
          seeds={data.seeds}
          irregularity={data.irregularity}
          width={visualWidth}
          tokenType={data.tokenType}
          partnerName={data.partnerName}
        />
      </View>
      <Text style={[styles.tokenNumber, small && styles.textSmall]} numberOfLines={1}>
        #{data.tokenNumber} · {displayName}
      </Text>
      <Text style={[styles.amount, small && styles.textSmall]} numberOfLines={1}>
        {formattedAmount}
      </Text>
      <Text style={[styles.date, small && styles.textSmaller]} numberOfLines={1}>
        {data.date}
      </Text>
      <Text style={[styles.owner, small && styles.textSmaller]} numberOfLines={1}>
        from @{data.originalOwner}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  cardSmall: {
    padding: 8,
    borderRadius: 10,
  },
  visualWrapper: {
    marginBottom: 4,
  },
  tokenNumber: {
    fontFamily: fonts.dmMono,
    fontSize: 10,
    color: '#1C1C1E',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  amount: {
    fontFamily: fonts.dmMono,
    fontSize: 11,
    color: '#1C1C1E',
    textAlign: 'center',
  },
  date: {
    fontFamily: fonts.dmMono,
    fontSize: 9,
    color: '#8E8E93',
    textAlign: 'center',
  },
  owner: {
    fontFamily: fonts.dmMono,
    fontSize: 9,
    color: '#8E8E93',
    textAlign: 'center',
  },
  textSmall: {
    fontSize: 9,
  },
  textSmaller: {
    fontSize: 8,
  },
});
