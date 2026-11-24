# dsh-asteme

[Asteme](https://github.com/asteme/asteme) inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): someone you talk to, and the same one each time. It remembers what you tell it together with the situation it applies to, brings a memory back when that situation comes up again, and changes what comes to mind from how using it turned out. It can hand work to a DSH agent and tell you how it went.

It runs on your computer. Everything it remembers is in one SQLite file.

**Status: in development.** Behavior may change, and it may fail or lose data. Do not rely on it for anything important yet.

## Install

In DSH, open Plugins and add `dsh-asteme`. Or from a terminal:

```
dsh plugin --profile web add dsh-asteme
```

Then send one message in a DSH session (Asteme speaks with the model you use there), and open ASTEME in the side bar.

The source, the documentation in eight languages and the issues are at <https://github.com/asteme/asteme>. The site: <https://asteme.github.io/asteme/>.

Apache-2.0: see LICENSE and NOTICE. The name and the mark are the project's own.

## After an update

A native library that a plugin loaded into DSH's process stays there until DSH is restarted; reloading or switching the plugin off does not remove it. Versions up to 0.11.0-alpha.5 loaded the embedding model's libraries into DSH itself. After updating from one of them, restart DSH once. From 0.11.0-alpha.6 on, those libraries are loaded only in Asteme's own embedding process.
