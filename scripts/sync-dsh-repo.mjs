// Rebuild the DSH bundle from this repository and publish it to
// asteme/dsh-asteme. The bundle repository is generated; do not edit it by hand.
//
// Usage: node scripts/sync-dsh-repo.mjs

import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const remote = "https://github.com/asteme/dsh-asteme.git";
const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
const temp = await mkdtemp(join(tmpdir(), "asteme-dsh-"));

const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: "inherit" });
const capture = (command, args, cwd = root) => execFileSync(command, args, { cwd }).toString().trim();

try {
  run(process.execPath, ["scripts/make-dsh-bundle.mjs"]);
  run("git", ["clone", "--depth", "1", remote, temp]);

  for (const name of await readdir(temp)) {
    if (name !== ".git") await rm(join(temp, name), { recursive: true, force: true });
  }
  await cp(join(root, "dist-dsh"), temp, { recursive: true });

  if (!capture("git", ["status", "--porcelain"], temp)) {
    console.log("Bundle is already up to date");
  } else {
    run("git", ["add", "-A"], temp);
    run("git", ["-c", "user.name=WSL043", "-c", "user.email=wsl043@users.noreply.github.com",
      "commit", "-m", `Asteme DSH plugin ${version}`], temp);
    run("git", ["push", "origin", "HEAD:main"], temp);
    console.log("Updated", remote);
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
