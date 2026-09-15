import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8788');
if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) {
  throw new Error('Supply an HTTP(S) site URL without credentials.');
}
const sha256 = data => createHash('sha256').update(data).digest('hex');
const localHtml = await readFile('dist/index.html', 'utf8');
const entry = localHtml.match(/src="([^"]+\.js)"/)?.[1];
if (!entry) throw new Error('Build dist before verifying a deployment.');
const home = await fetch(new URL('/', base));
const homeText = await home.text();
const deep = await fetch(new URL('/deployment-check/deep-link', base));
const deepText = await deep.text();
const files = (await readdir('dist/assets')).filter(name => /\.(?:js|css)$/.test(name));
const paths = [...files.map(name => `/assets/${name}`), '/asset-manifest.json',
  ...['A-1', 'B-1', 'C-1', 'C-2', 'F-1', 'F-2', 'N-1', 'N-2', 'P-1', 'P-2', 'X-1', 'X-2']
    .map(id => `/assets/endings/${id}.txt`)];
const checks = [];
for (let start = 0; start < paths.length; start += 6) {
  checks.push(...await Promise.all(paths.slice(start, start + 6).map(async path => {
    const response = await fetch(new URL(path, base));
    const remote = Buffer.from(await response.arrayBuffer());
    const local = await readFile(`dist${path}`);
    return { path, status: response.status, match: response.ok && sha256(local) === sha256(remote),
      cacheControl: response.headers.get('cache-control') };
  })));
}
const video = await fetch(new URL('/assets/video/opening-014.mp4', base), { method: 'HEAD' });
const manifest = checks.find(check => check.path === '/asset-manifest.json');
const headers = {
  csp: home.headers.get('content-security-policy'),
  referrer: home.headers.get('referrer-policy'),
  nosniff: home.headers.get('x-content-type-options'),
  permissions: home.headers.get('permissions-policy'),
};
const passed = home.ok && homeText.includes(entry) && deep.ok && deepText.includes(entry)
  && checks.every(check => check.match) && video.ok
  && headers.csp?.includes("script-src 'self'") && headers.csp?.includes("frame-ancestors 'none'")
  && headers.referrer === 'strict-origin-when-cross-origin' && headers.nosniff === 'nosniff'
  && headers.permissions === 'camera=(), microphone=(), geolocation=()'
  && manifest?.cacheControl?.includes('no-store')
  && checks.filter(check => check.path.startsWith('/assets/')).every(check => check.cacheControl?.includes('immutable'));
const report = { verifiedAt: new Date().toISOString(), origin: base.origin, passed: Boolean(passed),
  homeStatus: home.status, deepLinkStatus: deep.status, entry, headers, checks,
  openingVideo: { status: video.status, type: video.headers.get('content-type'), bytes: video.headers.get('content-length') } };
await mkdir('.codex-test-tmp', { recursive: true });
await writeFile('.codex-test-tmp/cloudflare-production-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ origin: report.origin, passed: report.passed, checkedFiles: checks.length,
  homeStatus: home.status, deepLinkStatus: deep.status, openingVideo: report.openingVideo,
  mismatches: checks.filter(check => !check.match) }, null, 2));
if (!report.passed) process.exitCode = 1;
