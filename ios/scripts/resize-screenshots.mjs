import sharp from 'sharp';
import path from 'path';
import { rmSync } from 'fs';

const W = 1284;
const H = 2778;

const inputDir = 'C:/Users/User/Downloads';
const outputDir = 'C:/Users/User/Documents/maison-fraise/ios/assets';

// Delete old screenshots
const oldFiles = [
  'screenshot-board.png', 'screenshot-chocolate.png', 'screenshot-events.png',
  'screenshot-review.png', 'screenshot-where.png',
  'store-board-captioned.png', 'store-board-clean.png',
  'store-chocolate-captioned.png', 'store-chocolate-clean.png',
  'store-review-captioned.png', 'store-review-clean.png',
];
for (const f of oldFiles) {
  try { rmSync(`${outputDir}/${f}`); console.log(`✗ deleted ${f}`); } catch {}
}

const screens = [
  { file: 'image9 (1).png',  name: 'board',     caption: 'What is ready today.',              sub: 'Sourced fresh. Dipped to order.' },
  { file: 'image5 (1).png',  name: 'chocolate',  caption: 'The chocolate is always warm.',      sub: 'Guanaja, Caraïbe, Jivara, Ivoire Blanc.' },
  { file: 'image4 (1).png',  name: 'finish',     caption: 'Every detail is yours.',             sub: 'Plain, Fleur de Sel, or Or Fin gold leaf.' },
  { file: 'image3 (2).png',  name: 'quantity',   caption: 'For yourself or someone else.',      sub: 'Add a handwritten note and sealed box.' },
  { file: 'image0 (4).png',  name: 'review',     caption: 'Built exactly the way you want it.', sub: 'Every detail, confirmed before you pay.' },
  { file: 'image1 (3).png',  name: 'when',       caption: 'Choose your collection window.',     sub: 'Same-day orders only. The box will be warm.' },
  { file: 'image2 (1).png',  name: 'where',      caption: 'Find us here.',                      sub: 'Marché Atwater. Every morning.' },
  { file: 'image6 (1).png',  name: 'orders',     caption: 'Your orders, always on hand.',       sub: 'Track every order by email.' },
];

for (const screen of screens) {
  const src = path.join(inputDir, screen.file);
  const imgH = Math.round(H * 0.78);
  const barH = H - imgH;

  const screenImg = await sharp(src)
    .resize(W, imgH, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer();

  const captionBar = Buffer.from(
    `<svg width="${W}" height="${barH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${barH}" fill="#1C3A2A"/>
      <text x="${W/2}" y="${barH * 0.42}"
        font-family="Georgia, serif" font-size="72" font-style="italic"
        fill="#E8E0D0" text-anchor="middle" dominant-baseline="middle"
      >${screen.caption}</text>
      <text x="${W/2}" y="${barH * 0.72}"
        font-family="Georgia, serif" font-size="44"
        fill="rgba(232,224,208,0.55)" text-anchor="middle" dominant-baseline="middle"
      >${screen.sub}</text>
    </svg>`
  );
  const captionBarImg = await sharp(captionBar).png().toBuffer();

  const GREEN = { r: 28, g: 58, b: 42 };
  await sharp({ create: { width: W, height: H, channels: 4, background: GREEN } })
    .composite([
      { input: screenImg,     top: 0,    left: 0 },
      { input: captionBarImg, top: imgH, left: 0 },
    ])
    .png()
    .toFile(path.join(outputDir, `store-${screen.name}.png`));
  console.log(`✓ store-${screen.name}.png`);
}

console.log('\nDone. 8 App Store screenshots saved to ios/assets/');
