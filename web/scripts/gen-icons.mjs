#!/usr/bin/env node
/**
 * Rasterise the app icon from public/icons/icon.svg.
 *
 * Run by hand and commit the output. The icon changes rarely, and a build that
 * shells out to an image library is a build that can break for reasons unrelated
 * to the code.
 *
 * The maskable variant is drawn on a larger canvas with padding, because launchers
 * crop maskable icons to whatever shape they like. Without the padding the fish
 * loses its tail on a circular mask.
 *
 * Lives here rather than in the repo's tools/ directory because it depends on
 * sharp, which is a devDependency of this package.
 *
 * Usage, from web/:
 *   npm run icons
 */

import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ICONS = fileURLToPath(new URL('../public/icons/', import.meta.url));
const source = await readFile(`${ICONS}icon.svg`);

/** Plain square icons. */
for (const size of [192, 512]) {
  await sharp(source, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(`${ICONS}icon-${size}.png`);
  console.log(`icon-${size}.png`);
}

/** iOS home screen. No transparency: iOS composites it on black otherwise. */
await sharp(source, { density: 384 })
  .resize(180, 180)
  .flatten({ background: '#04283c' })
  .png({ compressionLevel: 9 })
  .toFile(`${ICONS}apple-touch-icon-180.png`);
console.log('apple-touch-icon-180.png');

/**
 * Maskable: the artwork shrunk to 80% on a full-bleed background, leaving a 10%
 * safe margin on every side for the launcher to crop into.
 */
const inner = await sharp(source, { density: 384 }).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#04283c' } })
  .composite([{ input: inner, gravity: 'centre' }])
  .png({ compressionLevel: 9 })
  .toFile(`${ICONS}maskable-512.png`);
console.log('maskable-512.png');

/** A 32px PNG named .ico. Every current browser accepts this. */
const favicon = await sharp(source, { density: 384 }).resize(32, 32).png({ compressionLevel: 9 }).toBuffer();
await writeFile(`${ICONS}favicon.ico`, favicon);
console.log('favicon.ico');
