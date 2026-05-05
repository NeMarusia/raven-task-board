import { mkdir, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'dist-desktop');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const file of ['index.html', 'styles.css', 'app.js']) {
  await copyFile(join(root, file), join(out, file));
}

console.log(`Desktop assets copied to ${out}`);
