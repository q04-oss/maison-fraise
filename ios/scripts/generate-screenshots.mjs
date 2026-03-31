import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, '../assets');

const W = 1284;
const H = 2778;
const GREEN = { r: 28, g: 58, b: 42 };

const screens = [
  { file: 'screenshot-board.png',     name: 'board',     caption: 'What is ready today.',              sub: 'Sourced fresh. Dipped to order.' },
  { file: 'screenshot-chocolate.png', name: 'chocolate', caption: 'The chocolate is always warm.',      sub: 'Guanaja, Caraïbe, Jivara, Ivoire Blanc.' },
  { file: 'screenshot-review.png',    name: 'review',    caption: 'Built exactly the way you want it.', sub: 'Every detail, confirmed before you pay.' },
];

for (const screen of screens) {
  const src = path.join(assets, screen.file);

  // 1. Clean — screenshot scaled to fill canvas
  await sharp(src)
    .resize(W, H, { fit: 'cover', position: 'top' })
    .png()
    .toFile(path.join(assets, `store-${screen.name}-clean.png`));
  console.log(`✓ store-${screen.name}-clean.png`);

  // 2. Captioned — screenshot in top 78%, green bar with text below
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

  await sharp({ create: { width: W, height: H, channels: 4, background: GREEN } })
    .composite([
      { input: screenImg,     top: 0,    left: 0 },
      { input: captionBarImg, top: imgH, left: 0 },
    ])
    .png()
    .toFile(path.join(assets, `store-${screen.name}-captioned.png`));
  console.log(`✓ store-${screen.name}-captioned.png`);
}

console.log('\nAll 6 App Store screenshots generated in ios/assets/');
