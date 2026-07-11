import fs from 'node:fs';
import path from 'node:path';

const sampleRate = 22050;
const outputDir = path.resolve('public/assets/audio/sfx');
fs.mkdirSync(outputDir, { recursive: true });

const sounds = {
  'ui-hover': [{ start: 0, duration: 0.045, frequency: 720, endFrequency: 880, volume: 0.18, wave: 'square' }],
  'ui-click': [
    { start: 0, duration: 0.055, frequency: 420, endFrequency: 270, volume: 0.38, wave: 'square' },
    { start: 0.018, duration: 0.06, frequency: 150, endFrequency: 95, volume: 0.22, wave: 'triangle' },
  ],
  'ui-confirm': [
    { start: 0, duration: 0.09, frequency: 520, endFrequency: 590, volume: 0.3, wave: 'square' },
    { start: 0.075, duration: 0.13, frequency: 780, endFrequency: 920, volume: 0.32, wave: 'square' },
  ],
  'ui-cancel': [
    { start: 0, duration: 0.09, frequency: 480, endFrequency: 360, volume: 0.3, wave: 'square' },
    { start: 0.07, duration: 0.11, frequency: 310, endFrequency: 190, volume: 0.27, wave: 'triangle' },
  ],
  'dialogue-advance': [
    { start: 0, duration: 0.045, frequency: 920, endFrequency: 690, volume: 0.16, wave: 'square' },
    { start: 0.025, duration: 0.04, frequency: 610, endFrequency: 520, volume: 0.12, wave: 'square' },
  ],
  'choice-open': [
    { start: 0, duration: 0.13, frequency: 260, endFrequency: 410, volume: 0.2, wave: 'triangle' },
    { start: 0.09, duration: 0.16, frequency: 520, endFrequency: 690, volume: 0.22, wave: 'square' },
  ],
  'clue-add': [
    { start: 0, duration: 0.1, frequency: 360, endFrequency: 430, volume: 0.27, wave: 'square' },
    { start: 0.08, duration: 0.16, frequency: 650, endFrequency: 810, volume: 0.3, wave: 'triangle' },
    { start: 0.19, duration: 0.16, frequency: 930, endFrequency: 1040, volume: 0.22, wave: 'square' },
  ],
  'deduction-start': [
    { start: 0, duration: 0.4, frequency: 105, endFrequency: 165, volume: 0.32, wave: 'triangle', noise: 0.08 },
    { start: 0.22, duration: 0.32, frequency: 330, endFrequency: 490, volume: 0.2, wave: 'square' },
  ],
  warning: [
    { start: 0, duration: 0.16, frequency: 190, endFrequency: 170, volume: 0.34, wave: 'square' },
    { start: 0.2, duration: 0.16, frequency: 190, endFrequency: 150, volume: 0.34, wave: 'square' },
  ],
  success: [
    { start: 0, duration: 0.1, frequency: 440, endFrequency: 520, volume: 0.24, wave: 'triangle' },
    { start: 0.085, duration: 0.16, frequency: 660, endFrequency: 790, volume: 0.28, wave: 'square' },
  ],
  'sanity-drop': [{ start: 0, duration: 0.65, frequency: 180, endFrequency: 48, volume: 0.38, wave: 'saw', noise: 0.15 }],
  'ending-signal': [
    { start: 0, duration: 0.7, frequency: 82, endFrequency: 64, volume: 0.34, wave: 'triangle', noise: 0.09 },
    { start: 0.16, duration: 0.48, frequency: 410, endFrequency: 205, volume: 0.18, wave: 'square' },
    { start: 0.52, duration: 0.42, frequency: 760, endFrequency: 380, volume: 0.16, wave: 'square' },
  ],
};

for (const [name, voices] of Object.entries(sounds)) {
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
      const oscillator = voice.wave === 'square'
        ? (cycle < 0.5 ? 1 : -1)
        : voice.wave === 'saw'
          ? cycle * 2 - 1
          : 1 - 4 * Math.abs(cycle - 0.5);
      const attack = Math.min(1, i / (sampleRate * 0.008));
      const release = Math.pow(1 - t, 1.8);
      const noise = (Math.random() * 2 - 1) * (voice.noise || 0);
      samples[start + i] += (oscillator + noise) * voice.volume * attack * release;
    }
  }
  writeWav(path.join(outputDir, `${name}.wav`), samples);
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

console.log(`Generated ${Object.keys(sounds).length} SFX in ${outputDir}`);
