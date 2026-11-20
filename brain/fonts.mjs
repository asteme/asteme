// The names of the typefaces on the machine Asteme runs on, read from the
// font files themselves.
//
// A page can ask its browser for this (queryLocalFonts), but not every place a
// page is shown answers: inside some desktop shells the question is refused.
// The names here are only candidates. The page keeps the ones its own screen
// can really draw, so a list read on one machine never promises a typeface to
// another.
//
// Only the name table of each file is read: no outlines, nothing else.
import { closeSync, openSync, readdirSync, readSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

/** Where this kind of machine keeps its typefaces. */
export const fontFolders = (env = process.env, os = platform(), home = homedir()) =>
  (os === "win32"
    ? [
        join(env.WINDIR ?? env.SystemRoot ?? "C:\\Windows", "Fonts"),
        env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Microsoft", "Windows", "Fonts") : null,
      ]
    : os === "darwin"
      ? ["/System/Library/Fonts", "/Library/Fonts", join(home, "Library", "Fonts")]
      : ["/usr/share/fonts", "/usr/local/share/fonts", join(home, ".fonts"), join(home, ".local", "share", "fonts")]
  ).filter(Boolean);

const KINDS = /\.(ttf|otf|ttc|otc)$/i;
const filesIn = (folder, depth = 0, out = []) => {
  let entries;
  try {
    entries = readdirSync(folder, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (out.length >= 6000) break;
    if (e.isDirectory()) {
      if (depth < 4) filesIn(join(folder, e.name), depth + 1, out);
    } else if (KINDS.test(e.name)) out.push(join(folder, e.name));
  }
  return out;
};

const part = (fd, at, length) => {
  const b = Buffer.alloc(length);
  const n = readSync(fd, b, 0, length, at);
  return n === length ? b : null;
};
const words = (b, platformId) => {
  // Windows and Unicode names are sixteen bits a letter, high byte first; the old Macintosh ones are a byte a letter.
  if (platformId === 1) return b.toString("latin1");
  if (b.length % 2) return "";
  const copy = Buffer.from(b);
  copy.swap16();
  return copy.toString("utf16le");
};

/** The family names in one name table: the name to choose it by in every language it gives one in. */
export const namesIn = (table) => {
  if (!table || table.length < 6) return [];
  const count = table.readUInt16BE(2),
    strings = table.readUInt16BE(4),
    family = [],
    typographic = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    if (at + 12 > table.length) break;
    const platformId = table.readUInt16BE(at),
      nameId = table.readUInt16BE(at + 6),
      length = table.readUInt16BE(at + 8),
      offset = strings + table.readUInt16BE(at + 10);
    if ((nameId !== 1 && nameId !== 16) || !length || offset + length > table.length || ![0, 1, 3].includes(platformId)) continue;
    const name = words(table.subarray(offset, offset + length), platformId)
      .replace(/\0/g, "")
      .trim();
    if (name && !name.startsWith(".")) (nameId === 16 ? typographic : family).push(name);
  }
  // A family that says what it is properly called (16) is called that; its plainer name (1) is often one of its weights.
  return [...new Set(typographic.length ? typographic : family)];
};

/** The family names in one font file, or in each face of a collection. */
export const namesOfFile = (path) => {
  let fd;
  try {
    fd = openSync(path, "r");
  } catch {
    return [];
  }
  try {
    const head = part(fd, 0, 12);
    if (!head) return [];
    const starts = [];
    if (head.toString("latin1", 0, 4) === "ttcf") {
      const n = Math.min(64, head.readUInt32BE(8)),
        offs = part(fd, 12, n * 4);
      if (!offs) return [];
      for (let i = 0; i < n; i++) starts.push(offs.readUInt32BE(i * 4));
    } else starts.push(0);
    const names = new Set(),
      read = new Set();
    for (const start of starts) {
      const top = part(fd, start, 12);
      if (!top) continue;
      const tables = Math.min(80, top.readUInt16BE(4)),
        dir = part(fd, start + 12, tables * 16);
      if (!dir) continue;
      for (let i = 0; i < tables; i++) {
        if (dir.toString("latin1", i * 16, i * 16 + 4) !== "name") continue;
        const at = dir.readUInt32BE(i * 16 + 8),
          length = Math.min(1 << 20, dir.readUInt32BE(i * 16 + 12));
        if (read.has(at)) break;
        read.add(at);
        for (const n of namesIn(part(fd, at, length))) names.add(n);
        break;
      }
    }
    return [...names];
  } catch {
    return [];
  } finally {
    closeSync(fd);
  }
};

let kept = null;
/** Every family name found, sorted. Read once and kept for ten minutes: the files do not change under a conversation. */
export const fontNames = ({ folders = fontFolders(), now = Date.now() } = {}) => {
  const key = folders.join("|");
  if (kept && kept.key === key && now - kept.at < 600000) return kept.names;
  const names = new Set();
  for (const folder of folders) for (const file of filesIn(folder)) for (const n of namesOfFile(file)) names.add(n);
  kept = { key, at: now, names: [...names].sort((a, b) => a.localeCompare(b)) };
  return kept.names;
};
