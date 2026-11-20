// The conversation page is one document when it is served and several files when it is written: a shell, its styles, and its script in the parts it falls into.
// They share one scope, as they did when they were one file, so their order is the order of this list; a part may use what an earlier one named.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const at = (name) => fileURLToPath(new URL(`./page/${name}`, import.meta.url));
export const PAGE_SCRIPTS = [
  "0-base.js",
  "1-sky.js",
  "2-stars.js",
  "3-beginning.js",
  "4-conversation.js",
  "5-sheets.js",
  "6-handing.js",
  "7-aloud.js",
  "8-start.js",
];
export const PAGE_FILES = ["shell.html", "style.css", ...PAGE_SCRIPTS];
// Put together with functions, not strings: the script is full of `$`, which a replacement string would read as its own.
// The line ends are whatever the files were checked out with: on Windows they may be CRLF, and a place that was looked for with "\n" alone was not found, so a page
// went out with neither styles nor script. Both are taken, and a shell in which a place is missing is an error here, not a blank page there.
export const joinPage = (shell, style, scripts) => {
  if (!/\/\*__STYLE__\*\/\r?\n/.test(shell) || !/\/\*__SCRIPT__\*\/\r?\n/.test(shell))
    throw new Error("The page's shell has no place for its styles or its script");
  return shell.replace(/\/\*__STYLE__\*\/\r?\n/, () => style).replace(/\/\*__SCRIPT__\*\/\r?\n/, () => scripts.join(""));
};
const join = joinPage;
export const composePageSync = () =>
  join(
    readFileSync(at("shell.html"), "utf8"),
    readFileSync(at("style.css"), "utf8"),
    PAGE_SCRIPTS.map((n) => readFileSync(at(n), "utf8")),
  );
export const composePage = async () => {
  const [shell, style, ...scripts] = await Promise.all(PAGE_FILES.map((n) => readFile(at(n), "utf8")));
  return join(shell, style, scripts);
};
