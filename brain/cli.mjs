#!/usr/bin/env node
// asteme: start the brain on this computer and print where to talk to it.
//
// Settings are read from a JSON file (default ~/.asteme/brain.json, or the
// path in ASTEME_CONFIG). Secrets are not kept in it: a key is named by the
// environment variable that holds it.
//
//   { "model": { "url": "https://api.deepseek.com/v1", "name": "deepseek-chat", "keyEnv": "DEEPSEEK_API_KEY", "headers": {}, "effort": "" },
//     "judge": { "keyEnv": "JEV_API_KEY" },
//     "voice": { "keyEnv": "DEEPSEEK_API_KEY" },
//     "workers": { "dsh": { "command": "dsh", "args": ["acp"], "about": "A coding agent with files, a shell and a browser", "cwd": "/path/to/work" } },
//     "store": "~/.asteme/memory.sqlite", "port": 4170, "language": "" }
import { readFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { openMind } from "./mind.mjs";
import { openWorker } from "./acp.mjs";
import { chatModel } from "./model.mjs";
import { serve } from "./server.mjs";
import { deepseekVoice, speechVoice } from "./voice.mjs";
import { localEmbeddings } from "../src/embedding.mjs";
import { jevJudge } from "../src/jev.mjs";

// asteme [--person <name>] [export <file> | import <file>]
// A person is one store: memory, conversation, charter, pictures, everything.
// Without --person it is the store named in the settings. With it, each name
// is a separate person who knows nothing of the others. "export" writes the
// whole person to one file and "import" brings one in; neither starts the page.
const argv = process.argv.slice(2),
  flag = (name) => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv.splice(at, 2)[1] : null;
  };
const person = flag("--person"),
  [command, target] = argv;
if (person !== null && !/^[\p{L}\p{N}_-]{1,40}$/u.test(person ?? "")) {
  console.error("A person's name is letters, digits, - and _ (up to 40)");
  process.exit(2);
}
const home = (p) => (typeof p === "string" && p.startsWith("~") ? join(homedir(), p.slice(1)) : p);
const file = home(process.env.ASTEME_CONFIG ?? "~/.asteme/brain.json");
let config;
try {
  config = JSON.parse(await readFile(file, "utf8"));
} catch (e) {
  console.error(
    `Asteme needs its settings at ${file}: ${e.code === "ENOENT" ? "the file does not exist" : e.message}\nSee the top of brain/cli.mjs for what goes in it.`,
  );
  process.exit(2);
}
const secret = (name) => (name ? (process.env[name] ?? "") : "");
if (!config.model?.url || !config.model?.name) {
  console.error("The settings need model.url and model.name");
  process.exit(2);
}
const store = resolve(home(person ? `~/.asteme/people/${person}/memory.sqlite` : (config.store ?? "~/.asteme/memory.sqlite")));
await mkdir(dirname(store), { recursive: true });
if (command === "export" || command === "import") {
  if (!target) {
    console.error(`Say which file: asteme ${command} <file>`);
    process.exit(2);
  }
  const { Log } = await import("../src/log.mjs");
  const { Asteme } = await import("../src/core.mjs");
  const { writeFile } = await import("node:fs/promises");
  const log = new Log(store),
    core = new Asteme({ log, identity: { userId: "local", agentId: "assistant" }, embed: localEmbeddings() });
  if (command === "export") {
    await writeFile(resolve(home(target)), JSON.stringify(core.exportArchive()));
    console.log(
      `${person ?? "This person"} was written to ${resolve(home(target))}. The file holds everything, in the clear: keep it as you would keep a diary.`,
    );
  } else {
    const r = core.importArchive(JSON.parse(await readFile(resolve(home(target)), "utf8")));
    console.log(`Brought in: ${JSON.stringify(r).slice(0, 300)}`);
  }
  log.close();
  process.exit(0);
}
if (command) {
  console.error(`Unknown command: ${command}`);
  process.exit(2);
}
const workers = Object.fromEntries(
  Object.entries(config.workers ?? {}).map(([name, w]) => [
    name,
    {
      ...openWorker({ name, command: w.command, args: w.args ?? [], env: w.env ?? {}, cwd: resolve(home(w.cwd ?? process.cwd())) }),
      about: w.about ?? "",
    },
  ]),
);
// model.window, when given, is how many tokens the model can hold: one moment of the conversation is fitted to it.
const mind = openMind({
  path: store,
  workers,
  config: config.pace ?? {},
  models: {
    now: async () => ({ model: config.model.name, name: config.model.name, follows: false }),
    window: async () => Number(config.model.window) || null,
  },
  infer: chatModel({
    url: config.model.url,
    model: config.model.name,
    key: secret(config.model.keyEnv),
    headers: config.model.headers ?? {},
    effort: config.model.effort ?? "",
  }),
  embed: localEmbeddings(),
  judge: secret(config.judge?.keyEnv) ? jevJudge({ key: secret(config.judge.keyEnv) }) : null,
  // "voice": { "keyEnv": "DEEPSEEK_API_KEY" } lends DeepSeek's voice for reading replies aloud. Without it the device's own voice reads, which needs nothing.
  // With "url" it is any service of the "audio/speech" kind (OpenAI's, or a local server made to match it): { "url": "http://127.0.0.1:8880/v1", "model": "kokoro", "voices": ["af_heart"], "keyEnv": "" }.
  voice: config.voice?.url
    ? speechVoice({
        url: config.voice.url,
        model: config.voice.model,
        voices: config.voice.voices,
        rate: Number(config.voice.rate) || 24000,
        auth: async () => (secret(config.voice.keyEnv) ? { authorization: `Bearer ${secret(config.voice.keyEnv)}` } : {}),
        same: () => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(config.voice.url),
      })
    : secret(config.voice?.keyEnv)
      ? deepseekVoice({
          auth: async () => ({ authorization: `Bearer ${secret(config.voice.keyEnv)}` }),
          same: () => /deepseek/i.test(config.model.url),
        })
      : null,
});
const door = await serve(mind, { port: config.port ?? 4170, language: config.language ?? "" });
mind.start();
console.log(`Asteme is awake. Talk to it here:\n${door.url}`);
const stop = async () => {
  await door.close();
  mind.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
