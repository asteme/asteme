// Builds preview/preview.html: one self-contained file, no network requests.
//
//   npm install --no-save esbuild react react-dom
//   node preview/build.mjs
//
// Packages are also found through NODE_PATH if they are installed elsewhere.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const esbuild = createRequire(import.meta.url)('esbuild');

const result = await esbuild.build({
  entryPoints: [join(here, 'preview.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  minify: true,
  jsx: 'transform',
  loader: { '.css': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: (process.env.NODE_PATH ?? '').split(':').filter(Boolean),
});
const script = result.outputFiles[0].text.replace(/<\/script/g, '<\\/script');

writeFileSync(join(here, 'preview.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ASTEME panel preview</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; font: 14px/1.5 system-ui, sans-serif; }
  #root { display: flex; flex: 1; flex-direction: column; min-height: 0; }
  .pv-bar { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 10px 16px; font-size: 13px; }
  .pv-frame { flex: 1; min-height: 0; max-width: 100%; margin: 0 auto 16px; box-shadow: 0 0 0 1px rgb(128 128 128 / 0.35); }
</style>
</head>
<body>
<div id="root"></div>
<script>${script}</script>
</body>
</html>
`);
console.log('wrote preview/preview.html', (script.length / 1024).toFixed(0) + ' kB');
