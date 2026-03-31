import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SIZE = 1024;
const SPLASH_W = 1284;
const SPLASH_H = 2778;

// SVG strawberry centered on a forest green background
function makeSVG(width, height, strawberrySize) {
  const cx = width / 2;
  const cy = height / 2;
  const s = strawberrySize / 48; // scale factor (viewBox is 48×60)
  const sw = 48 * s;
  const sh = 60 * s;
  const ox = cx - sw / 2;
  const oy = cy - sh / 2;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#1C3A2A"/>
  <g transform="translate(${ox}, ${oy}) scale(${s})">
    <path d="M24 16 C22 11 15 7 17 2 C19 5 22 11 24 16Z" fill="#3D6B3D"/>
    <path d="M24 16 C26 11 33 7 31 2 C29 5 26 11 24 16Z" fill="#2D5A2D"/>
    <path d="M24 16 C24 10 22 4 24 2 C26 4 24 10 24 16Z" fill="#4A8040"/>
    <path d="M10 26 C8 36 10 48 18 55 C21 58 24 59 24 59 C24 59 27 58 30 55 C38 48 40 36 38 26 C34 18 28 15 24 15 C20 15 14 18 10 26Z" fill="#CC3333"/>
    <path d="M10 42 C10 52 16 57 24 59 C32 57 38 52 38 42 C32 40 28 39 24 39 C20 39 16 40 10 42Z" fill="#2C1810"/>
  </g>
</svg>`;
}

const iconSvg = makeSVG(SIZE, SIZE, 640);
const splashSvg = makeSVG(SPLASH_W, SPLASH_H, 480);

await sharp(Buffer.from(iconSvg)).png().toFile(path.join(__dirname, '../assets/icon.png'));
console.log('✓ icon.png');

await sharp(Buffer.from(splashSvg)).png().toFile(path.join(__dirname, '../assets/splash-icon.png'));
console.log('✓ splash-icon.png');

await sharp(Buffer.from(iconSvg)).png().toFile(path.join(__dirname, '../assets/adaptive-icon.png'));
console.log('✓ adaptive-icon.png');
