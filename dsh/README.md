# dsh-asteme

The DeepSeek Harness plugin bundle for [Asteme](https://github.com/asteme/asteme),
long-term memory for AI agents.

**Status: in development.** The source lives in the private `asteme/asteme`
repository. This repository is generated from it; do not edit it by hand.

Install from this repository with the DSH plugin dialog:

```
https://github.com/asteme/dsh-asteme.git
```

Or build it from the source repository with `npm run bundle` and install the
resulting `dist-dsh` directory from disk.

Apache-2.0: see LICENSE and NOTICE. The name and the mark are the project's own.

## After an update

A native library that a plugin loaded into DSH's process stays there until DSH is restarted; reloading or switching the plugin off does not remove it. Versions up to 0.11.0-alpha.5 loaded the embedding model's libraries into DSH itself. After updating from one of them, restart DSH once. From 0.11.0-alpha.6 on, those libraries are loaded only in Asteme's own embedding process.
