# dsh-asteme

The DeepSeek Harness plugin bundle for [Asteme](https://github.com/asteme/asteme),
long-term memory for AI agents.

**Status: in development.** The source and releases live in `asteme/asteme`.
This bundle is generated from the source; do not edit the generated files by hand.

Use the installation instructions in the [main repository](https://github.com/asteme/asteme).
To build from a checkout, run `npm run bundle` and install the resulting `dist-dsh`
directory from disk. Maintainers can regenerate `packages/dsh-asteme` for Git installs
with `npm run bundle -- --git-package`.

Apache-2.0: see LICENSE and NOTICE. The name and the mark are the project's own.

## After an update

A native library that a plugin loaded into DSH's process stays there until DSH is restarted; reloading or switching the plugin off does not remove it. Versions up to 0.11.0-alpha.5 loaded the embedding model's libraries into DSH itself. After updating from one of them, restart DSH once. From 0.11.0-alpha.6 on, those libraries are loaded only in Asteme's own embedding process.
