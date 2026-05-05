import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bundleDir = process.env.RTB_BUNDLE_DIR
  ? path.resolve(process.env.RTB_BUNDLE_DIR)
  : path.join(root, 'src-tauri', 'target', 'release', 'bundle');
const outDir = path.join(root, 'release-assets');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = process.env.RTB_RELEASE_VERSION || packageJson.version;
const platform = process.env.RTB_RELEASE_PLATFORM || process.platform;
const product = 'Raven-Task-Board';
const wanted = ['.AppImage', '.dmg', '.msi', '.exe', '.zip', '.deb', '.rpm'];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const files = walk(bundleDir).filter((file) => {
  const base = path.basename(file);
  return wanted.some((ext) => base.endsWith(ext));
});

if (!files.length) {
  console.error(`No release assets found under ${bundleDir}`);
  process.exit(1);
}

const seen = new Map();
for (const file of files) {
  const ext = wanted.find((candidate) => path.basename(file).endsWith(candidate));
  const key = `${platform}${ext}`;
  const n = (seen.get(key) || 0) + 1;
  seen.set(key, n);
  const suffix = n === 1 ? '' : `-${n}`;
  const dest = path.join(outDir, `${product}-${version}-${platform}${suffix}${ext}`);
  fs.copyFileSync(file, dest);
  console.log(`Copied ${path.relative(root, file)} -> ${path.relative(root, dest)}`);
}
