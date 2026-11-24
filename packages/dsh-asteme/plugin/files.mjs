// Files the plugin writes on the user's machine: exports, the diary, the
// developer report and backups. Everything stays under the plugin's own data
// directory unless the user moves it; nothing is sent anywhere.
import { mkdir, writeFile, readFile, readdir, stat, unlink } from "node:fs/promises";
import { join, resolve, dirname, basename, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync, gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import { dumpTables, plain } from "../src/archive.mjs";
import { STORE_FORMAT } from "../src/log.mjs";

// To the millisecond: two exports or copies in the same second are two files.
const stamp = at => new Date(at).toISOString().replace(/[:.]/g, "-").slice(0, 23);
const SECRET = /key|token|secret|password/i;
/** The host's configuration with anything that looks like a credential left out. */
export const publicConfig = config => Object.fromEntries(Object.entries(config).filter(([k, v]) => !SECRET.test(k) && ["string", "number", "boolean"].includes(typeof v)));

async function save(directory, files) {
  await mkdir(directory, { recursive: true });
  const written = [];
  for (const f of files) {
    const path = join(directory, f.name);
    await writeFile(path, f.text, "utf8");
    written.push({ name: f.name, bytes: Buffer.byteLength(f.text) });
  }
  return { path: directory, files: written, bytes: written.reduce((n, f) => n + f.bytes, 0) };
}

async function sizeOf(path) {
  const s = await stat(path).catch(() => null);
  if (!s) return 0;
  if (!s.isDirectory()) return s.size;
  let total = 0;
  for (const name of await readdir(path).catch(() => [])) total += await sizeOf(join(path, name));
  return total;
}
/** Where the space goes: the store itself, its copies, and what was exported beside it. */
export async function usage(host) {
  const store = (await sizeOf(join(host.directory, "memory.sqlite"))) + (await sizeOf(join(host.directory, "memory.sqlite-wal")));
  return { store, backups: await sizeOf(join(host.directory, "backups")), exports: await sizeOf(join(host.directory, "exports")) };
}
// Exports are copies. Of each kind the newest few are kept (exportKeep, three
// by default) and older ones removed, but only in the folder beside the
// store: a folder the user chose is theirs to tidy.
async function thinExports(host, kind) {
  const root = join(host.directory, "exports"), keep = Math.max(1, host.config.exportKeep ?? 3);
  const names = (await readdir(root).catch(() => [])).filter(n => n.startsWith(`asteme-${kind}-`)).sort().reverse();
  for (const old of names.slice(keep)) await rm(join(root, old), { recursive: true, force: true }).catch(() => {});
}
/**
 * Gives space back to the disk: with trim, old tool output that no memory
 * rests on is cut to its head first (see core.slim); then the store is
 * rewritten without its gaps and the write-ahead file is emptied.
 */
export async function reclaim(host, { trim = false } = {}) {
  const before = await usage(host);
  // Host bookkeeping stored by older versions holds no words and is read by
  // nothing, so it goes whether or not tool output is trimmed.
  const dropped = host.core.dropUnread();
  for (let n = 0; n < 100 && host.core.keepTraces({ most: 2000 }).more; n++);
  const slimmed = trim ? host.core.slim() : { rows: 0, bytes: 0 };
  host.log.db.exec("VACUUM");
  try { host.log.db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch {}
  const after = await usage(host);
  return { ...slimmed, dropped: dropped.rows, freed: Math.max(0, before.store - after.store), store: after.store };
}

/** archive: everything, to restore or move. diary: Markdown to read. report: for the developer, conversations included. */
// `to` is a folder chosen for this one export; otherwise the saved export
// folder, otherwise exports/ beside the store.
export async function writeExport(host, kind, { locale = "en", to } = {}) {
  const chosen = (typeof to === "string" && to.trim()) || host.config.exportDirectory;
  const at = stamp(host.log.now()), root = chosen ? resolve(chosen) : join(host.directory, "exports");
  const done = async result => { if (!chosen) await thinExports(host, kind); return result; };
  if (kind === "archive") return done(await save(join(root, `asteme-archive-${at}`), [{ name: "archive.json", text: JSON.stringify(host.core.exportArchive()) }]));
  if (kind === "diary") return done(await save(join(root, `asteme-diary-${at}`), host.core.diary({ locale })));
  if (kind === "report") {
    // How long each part of writing it took goes into the report itself: a slow export says where it was slow.
    const took = {}, timed = (name, run) => { const t0 = performance.now(); const v = run(); took[name] = Math.round(performance.now() - t0); return v; };
    const native = timed("libraries", nativeLoaded);
    const report = timed("report", () => host.core.report(host.log.now(), { native, exportMs: took,
      // Where it runs, and how the embedding process has been doing.
      env: { node: process.versions.node, ...(process.versions.electron ? { electron: process.versions.electron } : {}), platform: `${process.platform} ${process.arch}`, talking: !!host.brain },
      ...(host.embedder?.stats ? { embedding: host.embedder.stats() } : {}), ...(host.hostVersion ? { hostVersion: host.hostVersion } : {}), config: publicConfig(host.config), judge: host.judge ? { model: host.judge.model, mode: host.config.judgeMode } : null }));
    // Beside the report goes what a diagnosis reads, not the whole store: see exportEvidence. The complete copy is its own export.
    const evidence = timed("evidence", () => JSON.stringify(host.core.exportEvidence()));
    // The times are written into the report after they are known: the report was made before the evidence was.
    report.data.exportMs = took; const t0 = performance.now();
    const result = await save(join(root, `asteme-report-${at}`), [
      { name: "report.md", text: report.markdown + `\n## Writing this report\n\n- libraries ${took.libraries} ms; report ${took.report} ms; evidence ${took.evidence} ms (writing the files is not in these)\n` },
      { name: "report.json", text: JSON.stringify(report.data, null, 2) },
      { name: "evidence.json", text: evidence },
    ]);
    return done({ ...result, ms: { ...took, files: Math.round(performance.now() - t0) } });
  }
  throw new Error("Unknown export");
}

/** A consistent copy of the whole store, written by SQLite itself. */
export async function backupNow(host, label = "auto") {
  const directory = join(host.directory, "backups");
  await mkdir(directory, { recursive: true });
  // Two copies at the same instant get different names. What is on disk
  // afterwards is the compressed file, so that is the one looked for.
  const taken = async p => !!(await stat(p).catch(() => null)) || !!(await stat(`${p}.gz`).catch(() => null));
  let name = `memory-${stamp(host.log.now())}-${label}.sqlite`, path = join(directory, name);
  for (let n = 2; await taken(path); n++) { name = `memory-${stamp(host.log.now())}-${n}-${label}.sqlite`; path = join(directory, name); }
  host.log.db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
  // The copy is complete except for what is private to this machine.
  // Rewritten after the removal, so the key is not left in a freed page.
  const copy = new DatabaseSync(path);
  try { copy.exec("DELETE FROM state WHERE key LIKE 'secret:%'"); copy.exec("VACUUM"); } finally { copy.close(); }
  // Stored compressed: a store is mostly text and shrinks to a fraction.
  await writeFile(`${path}.gz`, gzipSync(await readFile(path)));
  await unlink(path);
  name += ".gz"; path += ".gz";
  host.log.save("backup-last", { at: host.log.now(), name });
  // Only copies are thinned out, oldest first, and never the memory itself.
  // A copy made before an import is kept until the user removes it.
  const keep = Math.max(1, host.config.backupKeep ?? 14);
  const all = await listBackups(host), auto = b => /-auto\.sqlite(\.gz)?$/.test(b.name);
  for (const old of all.filter(auto).slice(keep)) await unlink(join(directory, old.name)).catch(() => {});
  // Copies made by hand or before an import or a clean-up: the newest five.
  for (const old of all.filter(b => !auto(b)).slice(5)) await unlink(join(directory, old.name)).catch(() => {});
  return { path, name };
}

/**
 * After something was forgotten: every copy made before it still holds the
 * forgotten words, so the copies and exports kept beside the store are
 * removed and one new copy is made from the store as it is now. The space
 * the words occupied in the store itself is overwritten when they are erased
 * (secure_delete), and the write-ahead file is emptied here. Exports the user
 * saved to a folder of their own are theirs to remove; the panel says so.
 */
export async function forgetCopies(host) {
  const removed = { backups: 0, exports: 0 };
  for (const [kind, folder] of [["backups", "backups"], ["exports", "exports"]]) {
    const root = join(host.directory, folder);
    for (const name of await readdir(root).catch(() => [])) {
      await rm(join(root, name), { recursive: true, force: true });
      removed[kind]++;
    }
  }
  try { host.log.db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch {}
  const fresh = await backupNow(host, "after-forget");
  host.core.note?.("forget-copies", removed);
  return { ...removed, backup: fresh.name };
}

/**
 * Complete copies the user saved, newest first: from the folder beside the
 * store and from the folder chosen in Settings. Listed so that one can be
 * brought back with a click, without anyone typing where it is.
 */
export async function listSaved(host) {
  const roots = [...new Set([join(host.directory, "exports"), host.config.exportDirectory && resolve(host.config.exportDirectory)].filter(Boolean))], out = [];
  for (const root of roots) for (const name of await readdir(root).catch(() => [])) {
    if (!/^asteme-(archive|report)-/.test(name)) continue;
    // A report made since 0.11.0-alpha.13 holds a reduced copy, which is not something to bring back in; an older one holds a complete copy and is still offered.
    const file = join(root, name, "archive.json"), s = await stat(file).catch(() => null);
    if (s) out.push({ name, path: file, at: s.mtimeMs, bytes: s.size, kind: name.startsWith("asteme-report-") ? "report" : "archive" });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** The folders the panel may ask to have opened: where the store is, and where exports go. */
const ownFolders = host => [host.directory, host.config.exportDirectory && resolve(host.config.exportDirectory)].filter(Boolean);
/**
 * Shows a folder in the computer's file manager. Only a folder this plugin
 * writes to, or one inside it; the path comes from the panel, so anything
 * else is refused. Nothing is run but the system's own file manager.
 */
export async function reveal(host, target, { spawn, platform = process.platform } = {}) {
  const wanted = resolve(typeof target === "string" && target.trim() ? target : host.directory);
  const inside = ownFolders(host).some(root => wanted === root || wanted.startsWith(root.endsWith(sep) ? root : root + sep));
  if (!inside) throw new Error("Only Asteme's own folders can be opened from here");
  const s = await stat(wanted).catch(() => null);
  const folder = s?.isDirectory() ? wanted : dirname(wanted);
  if (!(await stat(folder).catch(() => null))) throw new Error("That folder does not exist yet");
  const command = platform === "win32" ? "explorer.exe" : platform === "darwin" ? "open" : "xdg-open";
  const run = spawn ?? (await import("node:child_process")).spawn;
  await new Promise((done, fail) => {
    const child = run(command, [folder], { detached: true, stdio: "ignore", windowsHide: false });
    child.once?.("error", e => fail(new Error(`The file manager could not be started (${e.code ?? e.message}). The folder is ${folder}`)));
    child.once?.("spawn", done);
    if (!child.once) done();
    child.unref?.();
  });
  return { opened: folder };
}

// What a reset keeps: how the plugin is set up, never anything that was said.
const KEPT_STATE = ["settings", "secret:", "installation", "last-model", "call-tokens", "excluded-sessions"];
/**
 * Starts over. Every memory, every stored message, every copy and every
 * export beside the store is removed; settings stay. Conversations already in
 * the host are not read in again. Exports saved to a folder of the user's own
 * are out of reach and are named in the result.
 */
export async function resetAll(host) {
  const removed = host.log.wipe({ keep: KEPT_STATE });
  let copies = 0;
  for (const folder of ["backups", "exports"]) {
    const root = join(host.directory, folder);
    for (const name of await readdir(root).catch(() => [])) { await rm(join(root, name), { recursive: true, force: true }); copies++; }
  }
  host.core._vectors?.clear(); host.core._intact = null;
  host.readings?.clear?.(); host.retries?.clear?.();
  host.lastError = null; host.notice = null;
  host.core.note?.("reset", { copies });
  return { memories: removed.experience ?? 0, records: removed.events ?? 0, copies, elsewhere: host.config.exportDirectory ? resolve(host.config.exportDirectory) : null };
}

const DIALOG = {
  win32: kind => ["powershell.exe", ["-NoProfile", "-STA", "-Command", [
    "Add-Type -AssemblyName System.Windows.Forms",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; Opacity = 0 }",
    kind === "folder"
      ? "$d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.ShowNewFolderButton = $true; if ($d.ShowDialog($owner) -eq 'OK') { Write-Output $d.SelectedPath }"
      : "$d = New-Object System.Windows.Forms.OpenFileDialog; $d.Filter = 'Asteme copies (*.json;*.sqlite;*.gz)|*.json;*.sqlite;*.gz|All files (*.*)|*.*'; if ($d.ShowDialog($owner) -eq 'OK') { Write-Output $d.FileName }",
    "$owner.Dispose()"].join("; ")]],
  darwin: kind => ["osascript", ["-e", `POSIX path of (choose ${kind === "folder" ? "folder" : "file"})`]],
  linux: kind => ["zenity", ["--file-selection", ...(kind === "folder" ? ["--directory"] : [])]],
};
/**
 * Asks the computer's own file chooser for a folder or a file and returns its
 * path, or null when the user closed it. The panel runs in a browser view and
 * cannot learn a real path by itself; this runs where the files are. Only the
 * system's chooser is started, with fixed arguments. One at a time.
 */
export async function pick(host, kind, { execFile, platform = process.platform } = {}) {
  if (kind !== "folder" && kind !== "file") throw new Error("Unknown kind of choice");
  const make = DIALOG[platform] ?? DIALOG.linux;
  if (host.picking) throw new Error("A chooser is already open");
  host.picking = true;
  try {
    const run = execFile ?? (await import("node:child_process")).execFile;
    const [command, args] = make(kind);
    const out = await new Promise((done, fail) => run(command, args, { windowsHide: true, timeout: 600000, encoding: "utf8" }, (error, stdout) => {
      if (!error) return done(stdout);
      // Closing the chooser is an answer, not a failure: osascript and zenity exit with 1.
      if (error.code === 1 && !String(stdout).trim()) return done("");
      fail(new Error(error.code === "ENOENT" ? "This computer has no file chooser Asteme can open. Type the path instead." : `The file chooser could not be opened (${error.code ?? error.message}). Type the path instead.`));
    }));
    const path = String(out).split(/\r?\n/).map(l => l.trim()).filter(Boolean).at(-1) ?? null;
    return { path };
  } finally { host.picking = false; }
}

export async function listBackups(host) {
  const directory = join(host.directory, "backups");
  const names = await readdir(directory).catch(() => []);
  const out = [];
  for (const name of names.filter(n => /\.sqlite(\.gz)?$/.test(n))) {
    const s = await stat(join(directory, name)).catch(() => null);
    if (s) out.push({ name, at: s.mtimeMs, bytes: s.size });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Reads an archive (JSON text or file) or a backup file and adds what this store lacks. A copy is made first. */
export async function importFrom(host, { path, content, backup } = {}) {
  let source;
  if (backup) path = join(host.directory, "backups", String(backup).replace(/[\\/]/g, ""));
  if (typeof content === "string") source = JSON.parse(content);
  else if (typeof path === "string" && path.trim()) {
    const file = resolve(path.trim());
    if (/\.(sqlite|db)(\.gz)?$/i.test(file)) {
      // A compressed copy is unpacked to a temporary file, read, and removed.
      const packed = /\.gz$/i.test(file), open = packed ? join(tmpdir(), `asteme-restore-${process.pid}-${Date.now()}.sqlite`) : file;
      if (packed) await writeFile(open, gunzipSync(await readFile(file)));
      const db = new DatabaseSync(open, { readOnly: true });
      try {
        const written = db.prepare("PRAGMA user_version").get().user_version;
        if (written > STORE_FORMAT) throw new Error("This copy was written by a newer version of Asteme. Update the plugin, then import it.");
        source = { tables: dumpTables(db), createdAt: new Date((await stat(file)).mtimeMs).toISOString() };
      }
      finally { db.close(); if (packed) await unlink(open).catch(() => {}); }
    } else source = JSON.parse(await readFile(file, "utf8"));
  } else throw new Error("Choose a file to import");
  const before = await backupNow(host, "before-import");
  const result = host.core.importArchive(source);
  return plain({ ...result, backup: before.name });
}

/**
 * Every memory kept beside this one: each assistant and user pair has its own
 * store and nothing is shared between them. Read-only; which one is in use is
 * decided by who the host says is talking.
 */
export async function listPeople(host) {
  const root = dirname(host.directory), here = basename(host.directory), out = [];
  for (const name of await readdir(root).catch(() => [])) {
    const file = join(root, name, "memory.sqlite");
    if (!(await stat(file).catch(() => null))) continue;
    try {
      const db = name === here ? host.log.db : new DatabaseSync(file, { readOnly: true });
      try {
        const row = db.prepare("SELECT data FROM state WHERE key LIKE 'profile:%' LIMIT 1").get();
        const profile = row ? JSON.parse(row.data) : {};
        out.push({ id: name, current: name === here, name: profile.name || "", userName: profile.userName || "",
          memories: db.prepare("SELECT COUNT(*) AS n FROM experience").get().n });
      } finally { if (name !== here) db.close(); }
    } catch { /* not a store this version can read */ }
  }
  return plain(out.sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name)));
}

/**
 * Which of the libraries that run the embedding model are loaded in this
 * process, read from the process itself. Inside a host there should be none of
 * Asteme's: they belong in the embedding process (src/embed-worker.mjs), and a
 * copy loaded here can shut the host's own copy out. A library stays loaded
 * until the host is restarted, so after an update from a version that loaded
 * them here, this says so until then. Paths are cut to what follows
 * node_modules: the report is sent to a developer and a home folder's name is
 * nobody's business.
 */
export function nativeLoaded() {
  try {
    // Packages of every plugin share one folder, so a path does not say whose
    // a library is. What can be said: which are loaded, and whether two copies
    // of the image library are (that is the state in which the second fails).
    const short = (p) => { const store = p.indexOf("/node_modules/.pnpm/"), at = p.lastIndexOf("/node_modules/"); return store >= 0 ? p.slice(store + 20) : at >= 0 ? p.slice(at + 14) : p.slice(p.lastIndexOf("/") + 1); };
    // The process's own report is asked for the libraries it has loaded and nothing else. Left to itself it also lists the
    // network (every interface, each looked up by name), which on some machines takes many seconds and is of no use here.
    const about = process.report; let was; if (about && "excludeNetwork" in about) { was = about.excludeNetwork; about.excludeNetwork = true; }
    let listed; try { listed = about?.getReport?.().sharedObjects ?? []; } finally { if (was !== undefined) about.excludeNetwork = was; }
    const all = listed.map(p => String(p).replace(/\\/g, "/")).filter(p => /sharp|libvips|onnxruntime/i.test(p));
    const sharp = all.filter(p => /sharp-[^/]*\.node$/i.test(p)), folders = new Set(sharp.map(p => p.slice(0, p.lastIndexOf("/"))));
    return { sharp: all.filter(p => /sharp|libvips/i.test(p)).map(short), onnxruntime: all.filter(p => /onnxruntime/i.test(p)).map(short), copiesOfSharp: folders.size };
  } catch (e) { return { error: String(e?.message ?? e).slice(0, 160) }; }
}
