// Build a DSH plugin bundle from this repository, so a second machine can
// install it from a local directory without publishing source to npm.
//
// Usage: node scripts/make-dsh-bundle.mjs
// Result: dist-dsh/ with a package.json that has the dsh manifest.

import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
// --git-package makes the same thing where the repository keeps it for installing straight from git (packages/dsh-asteme); without it, dist-dsh/ as before.
const gitPackage = process.argv.includes("--git-package");
const packageDir = "packages/dsh-asteme";
const out = join(root, gitPackage ? packageDir : "dist-dsh");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const name of ["plugin", "src", "locale"]) {
  await cp(join(root, name), join(out, name), { recursive: true });
}
// "Check this model" in the panel runs the scenarios from eval/.
await mkdir(join(out, "eval"), { recursive: true });
for (const name of ["harness.mjs", "scenarios.mjs"]) await cp(join(root, "eval", name), join(out, "eval", name));
// Of the panel only the built file is needed. A bundle without it installs
// and then shows nothing, so its absence stops the build here.
try { await stat(join(root, "client", "dist", "client.js")); }
catch { throw new Error("client/dist/client.js is missing. Run `npm install` and `npm run build` first."); }
await mkdir(join(out, "client", "dist"), { recursive: true });
await cp(join(root, "client", "dist", "client.js"), join(out, "client", "dist", "client.js"));
// "Talk to Asteme itself" opens the conversation page from inside DSH.
for (const name of ["mind.mjs", "wake.mjs", "voice.mjs", "fonts.mjs", "acp.mjs", "server.mjs", "page.mjs"]) await cp(join(root, "brain", name), join(out, "brain", name));
await cp(join(root, "brain", "page"), join(out, "brain", "page"), { recursive: true });
for (const name of ["copy.mjs", "icon.mjs"]) await cp(join(root, "client", name), join(out, "client", name));
await cp(join(root, "client", "locales"), join(out, "client", "locales"), { recursive: true });
for (const name of ["cordis.patch.yml", "icon.svg", "LICENSE", "NOTICE"]) {
  await cp(join(root, name), join(out, name));
}
await cp(join(root, "dsh", "README.md"), join(out, "README.md"));

const manifest = {
  name: "dsh-asteme",
  version: pkg.version,
  description: pkg.description,
  keywords: pkg.keywords,
  type: "module",
  main: "./plugin/index.mjs",
  exports: {
    ".": "./plugin/index.mjs",
    "./core": "./src/core.mjs",
    "./client": "./client/dist/client.js",
    "./package.json": "./package.json",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg",
    "./log": "./src/log.mjs",
  },
  files: ["plugin", "src", "eval", "cordis.patch.yml", "README.md", "LICENSE", "NOTICE", "client/dist", "client/copy.mjs", "client/icon.mjs", "client/locales", "brain", "locale/*.json", "icon.svg"],
  license: "Apache-2.0",
  repository: { type: "git", url: "git+https://github.com/asteme/asteme.git", directory: packageDir },
  homepage: "https://github.com/asteme/asteme",
  bugs: { url: "https://github.com/asteme/asteme/issues" },
  engines: {
    node: ">=22.5.0",
    // DSH compares with prereleases included (app-boot/plugin-compatibility),
    // so one lower bound admits every later release candidate.
    dsh: ">=0.2.2-rc.1",
  },
  // The local embedding model. Without it recall has nothing to compare.
  dependencies: pkg.dependencies ?? {},
  dsh: {
    bundle: { patch: "./cordis.patch.yml" },
    client: {
      platform: "web",
      inject: [
        "@deepseek-ai/dsh-client-ui-layout",
        "@deepseek-ai/dsh-client-ui-sidebar",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-connection",
      ],
    },
  },
};

await writeFile(join(out, "package.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
// The bundle is fetched with git on the user's machine. Without this, a Windows git set to convert line ends rewrites every file as it arrives.
await writeFile(join(out, ".gitattributes"), "* text=auto eol=lf\n*.png binary\n*.jpg binary\n*.webp binary\n", "utf8");
console.log(`Built ${out}`);



