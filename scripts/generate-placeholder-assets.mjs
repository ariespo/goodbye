import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const sfxDir = path.join(root, 'public/assets/audio/sfx');
const itemDir = path.join(root, 'public/assets/images/items');
const effectsDir = path.join(root, 'public/assets/effects');
const backgroundDir = path.join(root, 'public/assets/backgrounds');
const characterDir = path.join(root, 'public/assets/characters');

fs.mkdirSync(sfxDir, { recursive: true });
fs.mkdirSync(itemDir, { recursive: true });
fs.mkdirSync(effectsDir, { recursive: true });
fs.mkdirSync(backgroundDir, { recursive: true });
fs.mkdirSync(characterDir, { recursive: true });

const sampleRate = 22050;

const sfxDefinitions = {
  'emotion-calm': [
    { start: 0, duration: 0.42, frequency: 150, endFrequency: 118, volume: 0.24, wave: 'triangle' },
  ],
  'emotion-happy': [
    { start: 0, duration: 0.16, frequency: 620, endFrequency: 760, volume: 0.18, wave: 'triangle' },
    { start: 0.12, duration: 0.2, frequency: 880, endFrequency: 1040, volume: 0.18, wave: 'square' },
  ],
  'emotion-sad': [
    { start: 0, duration: 0.58, frequency: 230, endFrequency: 118, volume: 0.22, wave: 'triangle' },
  ],
  'emotion-angry': [
    { start: 0, duration: 0.12, frequency: 92, endFrequency: 72, volume: 0.32, wave: 'saw', noise: 0.12 },
    { start: 0.03, duration: 0.18, frequency: 360, endFrequency: 180, volume: 0.16, wave: 'square' },
  ],
  'emotion-horror': [
    { start: 0, duration: 0.18, frequency: 1150, endFrequency: 640, volume: 0.18, wave: 'saw', noise: 0.08 },
    { start: 0.08, duration: 0.34, frequency: 75, endFrequency: 52, volume: 0.18, wave: 'triangle' },
  ],
  'emotion-insane': [
    { start: 0, duration: 0.08, frequency: 720, endFrequency: 460, volume: 0.16, wave: 'square' },
    { start: 0.07, duration: 0.07, frequency: 940, endFrequency: 510, volume: 0.14, wave: 'square' },
    { start: 0.14, duration: 0.1, frequency: 590, endFrequency: 970, volume: 0.15, wave: 'square' },
    { start: 0.24, duration: 0.12, frequency: 820, endFrequency: 390, volume: 0.13, wave: 'triangle', noise: 0.05 },
  ],
  'rain-loop': [
    { start: 0, duration: 2.6, frequency: 110, endFrequency: 100, volume: 0.12, wave: 'noise', noise: 0.55 },
  ],
  'rain-heavy': [
    { start: 0, duration: 2.2, frequency: 90, endFrequency: 82, volume: 0.2, wave: 'noise', noise: 0.75 },
    { start: 1.2, duration: 0.8, frequency: 58, endFrequency: 32, volume: 0.26, wave: 'triangle', noise: 0.16 },
  ],
  'thunder-distant': [
    { start: 0, duration: 1.4, frequency: 62, endFrequency: 28, volume: 0.34, wave: 'triangle', noise: 0.22 },
  ],
  'phone-vibrate': [
    { start: 0, duration: 0.18, frequency: 82, endFrequency: 78, volume: 0.3, wave: 'square' },
    { start: 0.26, duration: 0.18, frequency: 82, endFrequency: 78, volume: 0.3, wave: 'square' },
  ],
  'phone-ring': [
    { start: 0, duration: 0.35, frequency: 440, endFrequency: 440, volume: 0.18, wave: 'triangle' },
    { start: 0.48, duration: 0.35, frequency: 440, endFrequency: 440, volume: 0.18, wave: 'triangle' },
    { start: 1.0, duration: 0.35, frequency: 360, endFrequency: 360, volume: 0.16, wave: 'square' },
  ],
  'clock-tick': [
    { start: 0, duration: 0.055, frequency: 1300, endFrequency: 650, volume: 0.16, wave: 'square' },
  ],
  'loop-reset': [
    { start: 0, duration: 1.2, frequency: 48, endFrequency: 86, volume: 0.32, wave: 'saw', noise: 0.1 },
  ],
  'flashback-whoosh': [
    { start: 0, duration: 0.55, frequency: 720, endFrequency: 120, volume: 0.18, wave: 'noise', noise: 0.45 },
    { start: 0.1, duration: 0.42, frequency: 220, endFrequency: 96, volume: 0.16, wave: 'triangle' },
  ],
  'investigate-paper': [
    { start: 0, duration: 0.26, frequency: 920, endFrequency: 220, volume: 0.12, wave: 'noise', noise: 0.35 },
  ],
  'investigate-object': [
    { start: 0, duration: 0.16, frequency: 180, endFrequency: 120, volume: 0.18, wave: 'triangle', noise: 0.08 },
  ],
  'door-open': [
    { start: 0, duration: 0.72, frequency: 140, endFrequency: 72, volume: 0.22, wave: 'saw', noise: 0.18 },
  ],
  'footstep-rain': [
    { start: 0, duration: 0.16, frequency: 130, endFrequency: 80, volume: 0.16, wave: 'noise', noise: 0.42 },
    { start: 0.32, duration: 0.16, frequency: 120, endFrequency: 76, volume: 0.16, wave: 'noise', noise: 0.42 },
  ],
};

const itemPlaceholders = [
  { file: 'item-opening-note.png', width: 120, height: 80, label: 'NOTE', kind: 'note' },
  { file: 'item-opening-mug.png', width: 100, height: 120, label: 'MUG', kind: 'mug' },
  { file: 'item-bedroom-medicine-bottle.png', width: 60, height: 100, label: 'RX?', kind: 'bottle' },
  { file: 'item-opening-phone.png', width: 80, height: 140, label: 'MSG', kind: 'phone' },
  { file: 'item-opening-weather-alert.png', width: 120, height: 80, label: 'RAIN', kind: 'alert' },
  { file: 'item-convenience-store-receipt.png', width: 100, height: 60, label: 'RCPT', kind: 'receipt' },
  { file: 'item-convenience-store-bandaid.png', width: 40, height: 30, label: 'BAND', kind: 'bandaid' },
  { file: 'item-water-tower-notebook.png', width: 100, height: 80, label: 'BOOK', kind: 'notebook' },
  { file: 'item-water-tower-notebook-open.png', width: 140, height: 100, label: 'OPEN', kind: 'notebook-open' },
  { file: 'item-water-tower-flashlight.png', width: 80, height: 30, label: 'LITE', kind: 'flashlight' },
  { file: 'item-water-tower-old-photo.png', width: 80, height: 60, label: 'FOTO', kind: 'photo' },
  { file: 'item-water-tower-engraving.png', width: 120, height: 80, label: 'MARK', kind: 'engraving' },
  { file: 'item-bedroom-medicine-bottle-clear.png', width: 60, height: 100, label: 'RX!', kind: 'bottle-clear' },
  { file: 'item-bedroom-strawberry-hairtie.png', width: 80, height: 60, label: 'HAIR', kind: 'hairtie' },
  { file: 'item-bedroom-apron.png', width: 100, height: 140, label: 'APRN', kind: 'apron' },
  { file: 'item-player-line-torn-letter.png', width: 120, height: 80, label: 'LTR', kind: 'letter' },
  { file: 'item-old-man-room-altar-list.png', width: 100, height: 140, label: 'LIST', kind: 'list' },
  { file: 'item-detective-inn-scratch-mark.png', width: 60, height: 80, label: 'SCR', kind: 'scratch' },
];

const backgroundPlaceholders = [
  { file: 'water-tower.png', label: 'WTIN', kind: 'water-tower' },
  { file: 'water-tower-exterior.png', label: 'OUT', kind: 'water-tower-exterior' },
  { file: 'mountain-trail.png', label: 'TRAIL', kind: 'mountain-trail' },
  { file: 'senpai-building.png', label: 'SENP', kind: 'senpai-building' },
  { file: 'detective-inn.png', label: 'INN', kind: 'detective-inn' },
  { file: 'senpai-room.png', label: 'ROOM', kind: 'senpai-room' },
  { file: 'old-man-building.png', label: 'OLD', kind: 'old-man-building' },
  { file: 'old-man-room.png', label: 'ALTAR', kind: 'old-man-room' },
  { file: 'community-hospital.png', label: 'HOSP', kind: 'community-hospital' },
  { file: 'observation-deck.png', label: 'DECK', kind: 'observation-deck' },
];

const approvedBackgroundFiles = new Set([
  'bedroom1-night.png',
  'bedroom1.png',
  'community-hospital.png',
  'detective-inn.png',
  'home-night.png',
  'home.png',
  'mountain-trail.png',
  'observation-deck.png',
  'old-man-building.png',
  'old-man-room.png',
  'senpai-building.png',
  'senpai-room.png',
  'school-night.png',
  'school.png',
  'supermarket-night.png',
  'supermarket.png',
  'water-tower.png',
  'water-tower-exterior.png',
]);

const characterPlaceholders = [
  { file: 'old-man-normal.png', label: 'OLD', kind: 'old-man', mood: 'normal' },
  { file: 'old-man-happy.png', label: 'KIND', kind: 'old-man', mood: 'happy' },
  { file: 'old-man-horror.png', label: 'VOID', kind: 'old-man', mood: 'horror' },
  { file: 'detective-a-normal.png', label: 'DETA', kind: 'detective-a', mood: 'normal' },
  { file: 'detective-a-sad.png', label: 'PANIC', kind: 'detective-a', mood: 'sad' },
  { file: 'detective-b-normal.png', label: 'DETB', kind: 'detective-b', mood: 'normal' },
  { file: 'detective-b-angry.png', label: 'COLD', kind: 'detective-b', mood: 'angry' },
  { file: 'fumi-gone.png', label: 'GONE', kind: 'fumi-gone', mood: 'normal' },
  { file: 'fumi-silhouette.png', label: 'FUMI', kind: 'fumi-silhouette', mood: 'horror' },
  { file: 'fumi-child.png', label: 'CHILD', kind: 'fumi-child', mood: 'normal' },
  { file: 'touko-half-closed.png', label: 'TOUKO', kind: 'touko-half-closed', mood: 'normal' },
];

const glyphs = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['111', '101', '101', '101', '111'],
  P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  S: ['111', '100', '111', '001', '111'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  '!': ['010', '010', '010', '000', '010'],
  '?': ['111', '001', '010', '000', '010'],
};

for (const [name, voices] of Object.entries(sfxDefinitions)) {
  writeSfx(path.join(sfxDir, `${name}.wav`), voices);
}

for (const item of itemPlaceholders) {
  writePng(path.join(itemDir, item.file), drawItem(item));
}

for (const background of backgroundPlaceholders) {
  if (approvedBackgroundFiles.has(background.file)) {
    console.log(`Skipped approved background: ${background.file}`);
    continue;
  }
  writePng(path.join(backgroundDir, background.file), drawBackground(background));
}

for (const character of characterPlaceholders) {
  writePng(path.join(characterDir, character.file), drawCharacter(character));
}

writeRainGif(path.join(effectsDir, 'rain-overlay.gif'));
writeLightningGif(path.join(effectsDir, 'lightning-flash.gif'));
writeLoopTransitionGif(path.join(effectsDir, 'loop-transition.gif'));

console.log(`Generated ${Object.keys(sfxDefinitions).length} SFX, ${itemPlaceholders.length} item placeholders, ${backgroundPlaceholders.length} background placeholders, ${characterPlaceholders.length} character placeholders, and 3 effect GIFs.`);

function writeSfx(filePath, voices) {
  const duration = Math.max(...voices.map(voice => voice.start + voice.duration)) + 0.04;
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  for (const voice of voices) {
    const start = Math.floor(voice.start * sampleRate);
    const length = Math.floor(voice.duration * sampleRate);
    let phase = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / Math.max(1, length - 1);
      const frequency = voice.frequency + (voice.endFrequency - voice.frequency) * t;
      phase += frequency / sampleRate;
      const cycle = phase % 1;
      const oscillator = voice.wave === 'noise'
        ? 0
        : voice.wave === 'square'
          ? (cycle < 0.5 ? 1 : -1)
          : voice.wave === 'saw'
            ? cycle * 2 - 1
            : 1 - 4 * Math.abs(cycle - 0.5);
      const attack = Math.min(1, i / (sampleRate * 0.01));
      const release = Math.pow(1 - t, 1.55);
      const noise = (random(i + start) * 2 - 1) * (voice.noise || 0);
      samples[start + i] += (oscillator + noise) * voice.volume * attack * release;
    }
  }
  writeWav(filePath, samples);
}

function writeWav(filePath, samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buffer);
}

function drawItem({ width, height, label, kind }) {
  const pixels = createImage(width, height, [0, 0, 0, 0]);
  const ink = [224, 224, 218, 255];
  const mid = [128, 128, 124, 255];
  const dark = [30, 30, 32, 255];
  const shade = [72, 72, 72, 255];

  if (kind === 'note') {
    rect(pixels, 12, 12, width - 24, height - 22, ink);
    rect(pixels, 14, 14, width - 28, height - 26, [190, 190, 184, 255]);
    for (let y = 26; y < height - 18; y += 10) line(pixels, 22, y, width - 26, y, shade);
    line(pixels, 78, 58, 85, 54, dark); line(pixels, 85, 54, 92, 58, dark); line(pixels, 80, 53, 77, 49, dark); line(pixels, 90, 53, 93, 49, dark);
  } else if (kind === 'mug') {
    rect(pixels, 24, 28, 46, 62, ink);
    rect(pixels, 29, 34, 36, 50, mid);
    rect(pixels, 70, 42, 13, 28, ink);
    rect(pixels, 73, 47, 7, 18, [0, 0, 0, 0]);
    line(pixels, 36, 62, 50, 76, dark); line(pixels, 50, 76, 62, 60, dark);
    rect(pixels, 40, 45, 4, 4, dark); rect(pixels, 55, 45, 4, 4, dark);
  } else if (kind === 'bottle') {
    rect(pixels, 22, 10, 16, 10, ink);
    rect(pixels, 16, 20, 28, 68, ink);
    rect(pixels, 19, 38, 22, 22, mid);
    line(pixels, 22, 49, 38, 45, shade);
    line(pixels, 24, 55, 36, 52, shade);
  } else if (kind === 'phone') {
    rect(pixels, 18, 12, 44, 112, ink);
    rect(pixels, 22, 20, 36, 88, dark);
    rect(pixels, 26, 30, 28, 12, mid);
    rect(pixels, 26, 48, 24, 8, shade);
    rect(pixels, 26, 62, 20, 8, shade);
    rect(pixels, 37, 113, 6, 6, dark);
  } else if (kind === 'alert') {
    rect(pixels, 10, 15, 100, 50, ink);
    rect(pixels, 14, 20, 92, 40, dark);
    rect(pixels, 22, 28, 16, 16, mid);
    line(pixels, 25, 43, 35, 43, ink);
    for (let x = 47; x < 92; x += 8) line(pixels, x, 32, x + 4, 32, ink);
    line(pixels, 47, 45, 92, 45, shade);
  } else if (kind === 'receipt') {
    rect(pixels, 18, 8, width - 36, height - 18, ink);
    for (let y = 18; y < height - 18; y += 8) line(pixels, 25, y, width - 28, y, shade);
    line(pixels, 62, 14, 76, 14, dark);
  } else if (kind === 'bandaid') {
    rect(pixels, 5, 9, width - 10, 12, ink);
    rect(pixels, 15, 11, 10, 8, mid);
    setPixel(pixels, 10, 15, dark); setPixel(pixels, 30, 15, dark);
  } else if (kind === 'notebook') {
    rect(pixels, 20, 12, width - 40, height - 24, ink);
    rect(pixels, 25, 17, width - 50, height - 34, mid);
    line(pixels, 32, 20, 32, height - 22, dark);
    for (let y = 25; y < height - 24; y += 12) line(pixels, 40, y, width - 30, y, shade);
  } else if (kind === 'notebook-open') {
    rect(pixels, 12, 16, width - 24, height - 34, ink);
    line(pixels, Math.floor(width / 2), 18, Math.floor(width / 2), height - 22, dark);
    for (let y = 28; y < height - 28; y += 10) {
      line(pixels, 24, y, Math.floor(width / 2) - 8, y, shade);
      line(pixels, Math.floor(width / 2) + 8, y, width - 24, y, shade);
    }
  } else if (kind === 'flashlight') {
    rect(pixels, 14, 11, width - 34, 10, ink);
    rect(pixels, width - 22, 8, 12, 16, mid);
    rect(pixels, 20, 14, 18, 4, dark);
  } else if (kind === 'photo') {
    rect(pixels, 10, 8, width - 20, height - 20, ink);
    rect(pixels, 15, 13, width - 30, height - 30, dark);
    rect(pixels, 28, 23, 8, 12, mid);
    rect(pixels, 45, 22, 8, 13, mid);
    line(pixels, 17, height - 24, width - 18, 18, shade);
  } else if (kind === 'engraving') {
    rect(pixels, 12, 10, width - 24, height - 24, mid);
    for (let x = 20; x < width - 18; x += 14) line(pixels, x, 14, x - 12, height - 20, shade);
    line(pixels, 32, 36, 88, 28, dark);
    line(pixels, 32, 46, 92, 44, dark);
  } else if (kind === 'bottle-clear') {
    rect(pixels, 22, 10, 16, 10, ink);
    rect(pixels, 16, 20, 28, 68, ink);
    rect(pixels, 19, 38, 22, 24, [210, 210, 204, 255]);
    drawTinyText(pixels, 'RX', 23, 44, dark);
  } else if (kind === 'hairtie') {
    rect(pixels, 18, 22, 26, 6, ink);
    rect(pixels, 38, 16, 12, 12, mid);
    rect(pixels, 51, 21, 8, 8, ink);
    setPixel(pixels, 43, 20, dark); setPixel(pixels, 46, 23, dark);
  } else if (kind === 'apron') {
    rect(pixels, 34, 16, 30, 24, ink);
    rect(pixels, 24, 40, 52, 72, mid);
    rect(pixels, 45, 66, 16, 14, shade);
    line(pixels, 34, 20, 20, 44, ink); line(pixels, 64, 20, 80, 44, ink);
  } else if (kind === 'letter') {
    rect(pixels, 12, 16, width - 24, height - 34, ink);
    line(pixels, 26, 16, 20, height - 24, dark);
    line(pixels, 58, 16, 48, height - 26, dark);
    line(pixels, 88, 16, 96, height - 24, dark);
    for (let y = 28; y < height - 30; y += 12) line(pixels, 28, y, width - 30, y, shade);
  } else if (kind === 'list') {
    rect(pixels, 24, 12, width - 48, height - 28, ink);
    for (let y = 28; y < height - 30; y += 12) {
      line(pixels, 34, y, width - 34, y, dark);
      rect(pixels, 30, y - 2, 3, 3, shade);
    }
  } else if (kind === 'scratch') {
    rect(pixels, 18, 8, width - 36, height - 20, mid);
    line(pixels, 25, 18, 40, 52, dark);
    line(pixels, 31, 16, 46, 55, dark);
    line(pixels, 38, 18, 50, 49, dark);
  } else {
    rect(pixels, 10, 10, width - 20, height - 24, ink);
    rect(pixels, 16, 16, width - 32, height - 36, mid);
  }

  drawTinyText(pixels, label, Math.max(4, Math.floor(width / 2 - label.length * 4)), height - 14, ink);
  dither(pixels);
  return pixels;
}

function drawBackground({ label, kind }) {
  const width = 640;
  const height = 360;
  const pixels = createImage(width, height, [28, 28, 30, 255]);
  const sky = [50, 54, 58, 255];
  const far = [70, 72, 72, 255];
  const mid = [94, 94, 90, 255];
  const light = [158, 156, 144, 255];
  const ink = [20, 20, 22, 255];
  const white = [220, 218, 204, 255];

  rect(pixels, 0, 0, width, height, sky);
  rect(pixels, 0, 238, width, 122, [36, 38, 38, 255]);

  if (kind === 'water-tower') {
    rect(pixels, 0, 0, width, height, [24, 25, 26, 255]);
    for (let x = 0; x < width; x += 42) line(pixels, x, 42, x - 70, height, [42, 43, 43, 255]);
    rect(pixels, 56, 52, 528, 230, [54, 55, 54, 255]);
    rect(pixels, 84, 80, 472, 174, [34, 35, 35, 255]);
    for (let x = 120; x < 540; x += 80) line(pixels, x, 82, x - 34, 250, mid);
    line(pixels, 162, 212, 492, 188, light);
    line(pixels, 168, 232, 506, 224, light);
    rect(pixels, 270, 268, 100, 24, [18, 18, 18, 255]);
  } else if (kind === 'water-tower-exterior') {
    rect(pixels, 0, 0, width, 210, [44, 48, 52, 255]);
    rect(pixels, 0, 210, width, 150, [24, 33, 32, 255]);
    rect(pixels, 266, 64, 108, 86, [40, 42, 42, 255]);
    rect(pixels, 252, 86, 136, 18, mid);
    rect(pixels, 284, 150, 72, 128, [28, 29, 30, 255]);
    line(pixels, 284, 150, 226, 306, mid); line(pixels, 356, 150, 428, 306, mid);
    line(pixels, 262, 210, 384, 210, far);
    for (let x = 0; x < width; x += 58) line(pixels, x, 238, x - 42, 312, [54, 68, 58, 255]);
  } else if (kind === 'mountain-trail') {
    rect(pixels, 0, 0, width, 220, [58, 62, 62, 255]);
    line(pixels, 0, 206, 190, 122, far); line(pixels, 190, 122, 380, 214, far); line(pixels, 260, 192, 480, 104, mid); line(pixels, 480, 104, 640, 190, mid);
    for (let y = 180; y < 348; y += 24) {
      const offset = (y - 180) * 1.4;
      line(pixels, 230 - offset, y, 410 + offset, y + 8, light);
    }
    line(pixels, 270, 178, 120, 348, ink); line(pixels, 370, 178, 520, 348, ink);
    for (let x = 30; x < 620; x += 88) { rect(pixels, x, 154, 18, 92, [32, 38, 34, 255]); line(pixels, x - 38, 166, x + 9, 96, [40, 54, 42, 255]); line(pixels, x + 56, 166, x + 9, 96, [40, 54, 42, 255]); }
  } else if (kind === 'senpai-building') {
    rect(pixels, 0, 0, width, 210, [60, 64, 66, 255]);
    rect(pixels, 144, 46, 230, 246, [74, 74, 72, 255]);
    rect(pixels, 382, 104, 122, 188, [58, 58, 58, 255]);
    for (let y = 72; y < 230; y += 34) for (let x = 174; x < 334; x += 42) rect(pixels, x, y, 24, 16, [132, 130, 116, 255]);
    rect(pixels, 108, 244, 426, 58, [42, 42, 42, 255]);
    rect(pixels, 242, 254, 96, 48, [154, 150, 132, 255]);
    rect(pixels, 258, 266, 28, 36, ink); rect(pixels, 296, 266, 28, 36, ink);
  } else if (kind === 'detective-inn') {
    rect(pixels, 0, 0, width, height, [28, 25, 23, 255]);
    line(pixels, 0, 70, 640, 70, [82, 72, 62, 255]);
    line(pixels, 120, 70, 42, 320, [68, 59, 52, 255]); line(pixels, 520, 70, 598, 320, [68, 59, 52, 255]);
    rect(pixels, 148, 104, 82, 156, [48, 42, 38, 255]); rect(pixels, 410, 104, 82, 156, [48, 42, 38, 255]);
    rect(pixels, 170, 132, 38, 52, [112, 102, 84, 255]); rect(pixels, 432, 132, 38, 52, [112, 102, 84, 255]);
    rect(pixels, 286, 86, 68, 208, [18, 17, 16, 255]);
    line(pixels, 292, 186, 338, 178, light); line(pixels, 294, 202, 344, 202, light);
  } else if (kind === 'senpai-room') {
    rect(pixels, 0, 0, width, height, [76, 76, 72, 255]);
    rect(pixels, 72, 48, 180, 108, [150, 154, 150, 255]);
    rect(pixels, 88, 62, 148, 78, [78, 90, 94, 255]);
    rect(pixels, 366, 82, 124, 164, [54, 50, 46, 255]);
    rect(pixels, 390, 108, 76, 38, [176, 172, 156, 255]);
    rect(pixels, 116, 226, 280, 34, [46, 42, 38, 255]);
    rect(pixels, 170, 188, 52, 38, [170, 166, 148, 255]);
    line(pixels, 0, 260, 640, 260, [44, 44, 42, 255]);
  } else if (kind === 'old-man-building') {
    rect(pixels, 0, 0, width, 214, [62, 62, 58, 255]);
    rect(pixels, 76, 70, 192, 226, [70, 68, 62, 255]);
    rect(pixels, 310, 46, 224, 250, [58, 56, 52, 255]);
    for (let y = 92; y < 246; y += 46) for (let x = 106; x < 510; x += 62) rect(pixels, x, y, 32, 22, [118, 112, 96, 255]);
    rect(pixels, 272, 232, 88, 40, [128, 122, 104, 255]);
    rect(pixels, 424, 258, 54, 38, ink);
    line(pixels, 0, 302, 640, 286, [26, 30, 28, 255]);
  } else if (kind === 'old-man-room') {
    rect(pixels, 0, 0, width, height, [46, 38, 34, 255]);
    rect(pixels, 78, 68, 168, 126, [34, 30, 28, 255]);
    rect(pixels, 112, 96, 96, 70, [116, 100, 76, 255]);
    rect(pixels, 90, 214, 460, 54, [58, 46, 38, 255]);
    rect(pixels, 292, 102, 58, 92, [174, 164, 134, 255]);
    rect(pixels, 306, 116, 30, 38, [62, 54, 42, 255]);
    rect(pixels, 392, 134, 66, 92, white);
    for (let y = 150; y < 210; y += 12) line(pixels, 404, y, 444, y, ink);
    rect(pixels, 282, 214, 88, 18, [150, 116, 76, 255]);
  } else if (kind === 'community-hospital') {
    rect(pixels, 0, 0, width, height, [112, 116, 112, 255]);
    rect(pixels, 0, 0, width, 72, [170, 172, 164, 255]);
    rect(pixels, 86, 104, 470, 92, [208, 206, 192, 255]);
    rect(pixels, 112, 126, 142, 42, [74, 86, 86, 255]);
    rect(pixels, 304, 126, 142, 42, [74, 86, 86, 255]);
    rect(pixels, 156, 232, 326, 52, [72, 74, 70, 255]);
    rect(pixels, 424, 86, 52, 52, [198, 88, 88, 255]);
    rect(pixels, 442, 94, 16, 36, white); rect(pixels, 432, 104, 36, 16, white);
  } else if (kind === 'observation-deck') {
    rect(pixels, 0, 0, width, 234, [58, 66, 70, 255]);
    line(pixels, 0, 214, 220, 128, far); line(pixels, 220, 128, 430, 216, far); line(pixels, 380, 200, 640, 110, mid);
    rect(pixels, 0, 242, width, 118, [30, 31, 30, 255]);
    line(pixels, 54, 244, 594, 210, light);
    for (let x = 70; x < 590; x += 58) line(pixels, x, 230, x, 322, mid);
    line(pixels, 78, 282, 562, 262, [78, 78, 74, 255]);
    rect(pixels, 276, 252, 86, 68, [18, 18, 18, 255]);
  }

  drawTinyText(pixels, label, 24, 326, white);
  dither(pixels);
  return pixels;
}

function drawCharacter({ label, kind, mood }) {
  const width = 260;
  const height = 380;
  const pixels = createImage(width, height, [0, 0, 0, 0]);
  const ink = [36, 36, 38, 255];
  const cloth = [78, 78, 74, 255];
  const light = [184, 182, 170, 255];
  const mid = [126, 124, 116, 255];
  const shadow = [18, 18, 20, 255];
  const accent = mood === 'angry' ? [160, 70, 70, 255] : mood === 'horror' ? [210, 210, 204, 180] : [142, 140, 130, 255];

  if (kind === 'fumi-gone') {
    rect(pixels, 78, 214, 104, 18, mid);
    rect(pixels, 92, 232, 18, 94, cloth);
    rect(pixels, 150, 232, 18, 94, cloth);
    rect(pixels, 96, 158, 68, 56, [54, 54, 54, 140]);
    drawTinyText(pixels, label, 112, 334, light);
    dither(pixels);
    return pixels;
  }

  if (kind === 'fumi-silhouette') {
    rect(pixels, 104, 58, 52, 54, [210, 210, 216, 110]);
    rect(pixels, 72, 118, 116, 172, [190, 196, 210, 86]);
    rect(pixels, 88, 278, 28, 62, [190, 196, 210, 70]);
    rect(pixels, 144, 278, 28, 62, [190, 196, 210, 70]);
    for (let y = 64; y < 310; y += 22) line(pixels, 76, y, 184, y + 8, [230, 230, 238, 46]);
    drawTinyText(pixels, label, 110, 334, light);
    dither(pixels);
    return pixels;
  }

  const isChild = kind === 'fumi-child';
  const isTouko = kind === 'touko-half-closed';
  const isOld = kind === 'old-man';
  const isDetectiveA = kind === 'detective-a';
  const isDetectiveB = kind === 'detective-b';

  const headX = 104;
  const headY = isChild ? 76 : 56;
  const bodyTop = isChild ? 136 : 128;
  const bodyHeight = isChild ? 132 : 176;
  const shoulder = isChild ? 76 : 58;
  const bodyWidth = isChild ? 108 : 144;

  rect(pixels, headX, headY, 52, 58, light);
  rect(pixels, headX + 6, headY + 10, 40, 8, isOld ? [210, 210, 200, 255] : ink);
  rect(pixels, headX + 11, headY + 30, 7, 5, shadow);
  rect(pixels, headX + 34, headY + 30, 7, 5, shadow);
  if (mood === 'happy') {
    line(pixels, headX + 18, headY + 44, headX + 34, headY + 44, shadow);
  } else if (mood === 'sad') {
    line(pixels, headX + 17, headY + 46, headX + 35, headY + 42, shadow);
  } else if (mood === 'horror') {
    rect(pixels, headX + 9, headY + 27, 10, 9, shadow);
    rect(pixels, headX + 33, headY + 27, 10, 9, shadow);
  } else {
    line(pixels, headX + 18, headY + 43, headX + 34, headY + 43, shadow);
  }

  if (isTouko) {
    line(pixels, headX + 10, headY + 31, headX + 21, headY + 29, shadow);
    line(pixels, headX + 32, headY + 29, headX + 43, headY + 31, shadow);
  }

  rect(pixels, shoulder, bodyTop, bodyWidth, bodyHeight, cloth);
  rect(pixels, shoulder + 20, bodyTop + 22, bodyWidth - 40, bodyHeight - 38, isDetectiveB ? [54, 58, 62, 255] : [86, 84, 78, 255]);
  line(pixels, shoulder + 20, bodyTop + 8, shoulder - 10, bodyTop + 92, cloth);
  line(pixels, shoulder + bodyWidth - 20, bodyTop + 8, shoulder + bodyWidth + 10, bodyTop + 92, cloth);
  rect(pixels, 92, bodyTop + bodyHeight, 28, 58, ink);
  rect(pixels, 140, bodyTop + bodyHeight, 28, 58, ink);

  if (isOld) {
    line(pixels, headX + 10, headY + 24, headX + 2, headY + 42, mid);
    line(pixels, headX + 42, headY + 24, headX + 50, headY + 42, mid);
    rect(pixels, 80, 172, 22, 18, mood === 'happy' ? accent : mid);
  } else if (isDetectiveA) {
    rect(pixels, headX + 4, headY - 8, 44, 12, ink);
    rect(pixels, 70, 146, 120, 28, [54, 52, 48, 255]);
    if (mood === 'sad') line(pixels, 176, 184, 196, 220, accent);
  } else if (isDetectiveB) {
    rect(pixels, 84, 126, 92, 22, [24, 24, 26, 255]);
    rect(pixels, 72, 148, 116, 144, [34, 38, 42, 255]);
    if (mood === 'angry') line(pixels, headX + 12, headY + 24, headX + 23, headY + 29, accent);
  } else if (isChild) {
    rect(pixels, 88, 160, 84, 70, [112, 116, 126, 255]);
    rect(pixels, 100, 112, 60, 18, ink);
  } else if (isTouko) {
    rect(pixels, 86, 138, 88, 14, [24, 24, 26, 255]);
    rect(pixels, 158, 154, 12, 126, ink);
  }

  drawTinyText(pixels, label, Math.max(8, Math.floor(width / 2 - label.length * 4)), 344, light);
  dither(pixels);
  return pixels;
}

function createImage(width, height, fill) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set(fill, i * 4);
  return { width, height, data };
}

function setPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  image.data.set(color, (y * image.width + x) * 4);
}

function rect(image, x, y, width, height, color) {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) setPixel(image, xx, yy, color);
  }
}

function line(image, x0, y0, x1, y1, color) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    setPixel(image, x, y, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

function dither(image) {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if ((x + y) % 7 === 0 && random(x * 4099 + y) > 0.58) {
        const index = (y * image.width + x) * 4;
        if (image.data[index + 3] > 0) {
          image.data[index] = Math.max(0, image.data[index] - 18);
          image.data[index + 1] = Math.max(0, image.data[index + 1] - 18);
          image.data[index + 2] = Math.max(0, image.data[index + 2] - 18);
        }
      }
    }
  }
}

function drawTinyText(image, text, x, y, color) {
  let cursor = x;
  for (const char of text) {
    const glyph = glyphs[char] || glyphs['?'];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] === '1') rect(image, cursor + col * 2, y + row * 2, 2, 2, color);
      }
    }
    cursor += 8;
  }
}

function writePng(filePath, image) {
  const scanlines = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rowStart = y * (image.width * 4 + 1);
    scanlines[rowStart] = 0;
    Buffer.from(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4)).copy(scanlines, rowStart + 1);
  }
  const chunks = [
    pngChunk('IHDR', Buffer.concat([
      uint32(image.width),
      uint32(image.height),
      Buffer.from([8, 6, 0, 0, 0]),
    ])),
    pngChunk('IDAT', zlib.deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ];
  fs.writeFileSync(filePath, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]));
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(Buffer.concat([typeBuffer, data]))),
  ]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeRainGif(filePath) {
  const width = 64;
  const height = 64;
  const indexes = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      indexes[y * width + x] = ((x * 3 + y) % 19 === 0 || (x + y * 2) % 29 === 0) ? 1 : 0;
    }
  }
  const minCodeSize = 2;
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const codes = [clearCode, ...indexes, endCode];
  const imageData = packGifCodes(codes, minCodeSize + 1);
  const blocks = [];
  for (let i = 0; i < imageData.length; i += 255) {
    const block = imageData.subarray(i, i + 255);
    blocks.push(Buffer.from([block.length]), block);
  }
  blocks.push(Buffer.from([0]));
  fs.writeFileSync(filePath, Buffer.concat([
    Buffer.from('GIF89a', 'ascii'),
    Buffer.from([width, 0, height, 0, 0x80, 0, 0]),
    Buffer.from([0, 0, 0, 210, 210, 210]),
    Buffer.from([0x21, 0xf9, 0x04, 0x05, 8, 0, 0, 0]),
    Buffer.from([0x2c, 0, 0, 0, 0, width, 0, height, 0, 0]),
    Buffer.from([minCodeSize]),
    ...blocks,
    Buffer.from([0x3b]),
  ]));
}

function writeLightningGif(filePath) {
  const width = 64;
  const height = 64;
  const indexes = new Uint8Array(width * height);
  indexes.fill(0);
  for (let y = 0; y < height; y += 1) {
    const center = 30 + Math.floor(Math.sin(y * 0.42) * 10);
    for (let x = center - 2; x <= center + 2; x += 1) {
      if (x >= 0 && x < width) indexes[y * width + x] = 1;
    }
    if (y % 9 === 0) {
      for (let branch = 0; branch < 12; branch += 1) {
        const x = center + branch;
        const yy = y + branch;
        if (x >= 0 && x < width && yy < height) indexes[yy * width + x] = 1;
      }
    }
  }
  writeIndexedGif(filePath, width, height, indexes, [
    [0, 0, 0],
    [245, 245, 232],
  ], 5, true);
}

function writeLoopTransitionGif(filePath) {
  const width = 96;
  const height = 64;
  const indexes = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const crack = (x * 5 + y * 11) % 37 < 2 || Math.abs(x - y * 1.4) % 29 < 1.3;
      const vignette = x < 10 || x > width - 11 || y < 8 || y > height - 9;
      indexes[y * width + x] = vignette ? 0 : crack ? 2 : 1;
    }
  }
  writeIndexedGif(filePath, width, height, indexes, [
    [0, 0, 0],
    [58, 58, 62],
    [210, 210, 204],
    [122, 122, 126],
  ], 8, false);
}

function writeIndexedGif(filePath, width, height, indexes, palette, delay, transparent) {
  const minCodeSize = 2;
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const codes = [clearCode, ...indexes, endCode];
  const imageData = packGifCodes(codes, minCodeSize + 1);
  const blocks = [];
  for (let i = 0; i < imageData.length; i += 255) {
    const block = imageData.subarray(i, i + 255);
    blocks.push(Buffer.from([block.length]), block);
  }
  blocks.push(Buffer.from([0]));
  const paletteBytes = [];
  for (let i = 0; i < 4; i += 1) {
    const color = palette[i] || [0, 0, 0];
    paletteBytes.push(...color);
  }
  fs.writeFileSync(filePath, Buffer.concat([
    Buffer.from('GIF89a', 'ascii'),
    Buffer.from([width & 0xff, width >> 8, height & 0xff, height >> 8, 0x81, 0, 0]),
    Buffer.from(paletteBytes),
    Buffer.from([0x21, 0xf9, 0x04, transparent ? 0x05 : 0x04, delay, 0, 0, 0]),
    Buffer.from([0x2c, 0, 0, 0, 0, width & 0xff, width >> 8, height & 0xff, height >> 8, 0]),
    Buffer.from([minCodeSize]),
    ...blocks,
    Buffer.from([0x3b]),
  ]));
}

function packGifCodes(codes, codeSize) {
  const bytes = [];
  let accumulator = 0;
  let bits = 0;
  for (const code of codes) {
    accumulator |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(accumulator & 0xff);
      accumulator >>= 8;
      bits -= 8;
    }
  }
  if (bits > 0) bytes.push(accumulator & 0xff);
  return Buffer.from(bytes);
}

function random(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
