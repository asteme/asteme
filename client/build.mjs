import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { renderIconSvg } from './icon.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
await build({
  entryPoints: [resolve(root, 'client/index.jsx')],
  outfile: resolve(root, 'client/dist/client.js'),
  bundle: true, format: 'cjs', platform: 'browser', target: ['es2022'],
  jsx: 'automatic', minify: true, legalComments: 'none',
  external: ['react', 'react/jsx-runtime'],
  loader: { '.css': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-asteme",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
});
await writeFile(resolve(root, 'icon.svg'), renderIconSvg());
console.log('Built client/dist/client.js and shared icon.svg');
