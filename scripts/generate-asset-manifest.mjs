import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const assetsRoot = path.join(projectRoot, 'public', 'assets');
const outputFile = path.join(projectRoot, 'public', 'asset-manifest.json');
const excludedSegments = new Set(['concepts']);
const excludedNames = new Set(['manifest.plan.json']);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && excludedSegments.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile() && !excludedNames.has(entry.name) && !entry.name.endsWith('.eye-crop.png')) files.push(absolute);
  }
  return files;
}

function assetKind(relativePath) {
  const topLevel = relativePath.split('/')[1] ?? 'other';
  if (topLevel === 'backgrounds') return 'background';
  if (topLevel === 'characters') return 'character';
  if (topLevel === 'audio') return 'audio';
  if (topLevel === 'video') return 'video';
  if (topLevel === 'endings') return 'ending';
  return topLevel;
}

const files = (await walk(assetsRoot)).sort((a, b) => a.localeCompare(b));
const assets = {};
for (const absolute of files) {
  const relative = `assets/${path.relative(assetsRoot, absolute).replaceAll('\\', '/')}`;
  const [contents, metadata] = await Promise.all([readFile(absolute), stat(absolute)]);
  assets[relative] = {
    hash: createHash('sha256').update(contents).digest('hex').slice(0, 16),
    bytes: metadata.size,
    kind: assetKind(relative),
  };
}

const version = createHash('sha256')
  .update(JSON.stringify(assets))
  .digest('hex')
  .slice(0, 16);

await writeFile(outputFile, `${JSON.stringify({ version, generatedAt: new Date().toISOString(), assets }, null, 2)}\n`);
console.log(`Generated asset manifest ${version} with ${files.length} runtime assets.`);
