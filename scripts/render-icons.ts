/* Renders the PWA icons in public/icons from app/icon.svg. Run after changing it. */

import { readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("app/icon.svg");

async function main() {
  await sharp(svg, { density: 600 })
    .resize(192, 192)
    .png()
    .toFile("public/icons/icon-192.png");
  await sharp(svg, { density: 600 })
    .resize(512, 512)
    .png()
    .toFile("public/icons/icon-512.png");
  await sharp(svg, { density: 600 })
    .resize(180, 180)
    .png()
    .toFile("app/apple-icon.png");
  // Maskable: the glyph inside the safe zone, on a full-bleed background.
  const glyph = await sharp(svg, { density: 600 })
    .resize(360, 360)
    .png()
    .toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: "#0f6b5c" },
  })
    .composite([{ input: glyph, gravity: "center" }])
    .png()
    .toFile("public/icons/maskable-512.png");
}

void main();
