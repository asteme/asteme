// What may be remembered and what may be brought up are different questions
// (see DESIGN: "remember but do not bring up").
//
// Whether a record is about a private matter is a judgement about meaning, so
// the model that reads the turn makes it, in whatever language the turn is in,
// and names the categories. Code only checks that the names are ones it knows.
//
// Two things stay on the code side. A secret has a shape (a key, a token
// assignment) and a shape can be matched in any language. And when the model
// names nothing at all, the word list below is used on the user's own words as
// a conservative stand-in. It is English-only: patterns for other languages
// are data, in an optional policy.local.json next to this file, as
// {"credentials": ["..."], "health": ["..."], ...} of regular expression sources.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CATEGORIES = ["credentials", "security", "health", "money", "privacy"];

const builtin = {
  credentials: [
    /\bpassword\b|\bpassphrase\b|\bcredential\b|\bprivate key\b/i,
    /\b(api|access|auth|bearer)[ _-]?token\b|\btoken\s*[:=]\s*\S+/i,
    /\bsk-[A-Za-z0-9_-]{8,}/,
  ],
  security: [
    /\bprivilege escalation\b|\brootkit\b|\bexploit\b|\bbackdoor\b|\bjailbreak\b/i,
    /\buac\b|\bauth(?:entication)? bypass\b|\bacl bypass\b/i,
  ],
  health: [/\bdiagnos|\bmedication\b|\btherapy\b|\bsymptom|\bhealth record\b|\bprescription\b/i],
  money: [/\bsalary\b|\bbank\b|\bloan\b|\bdebt\b|\bcredit card\b|\bincome\b|\btax return\b/i],
  privacy: [/\bhome address\b|\bphone number\b|\bpassport\b|\bnational id\b|\bemail address\b/i],
};

function local() {
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), "policy.local.json");
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return Object.fromEntries(CATEGORIES.map((category) =>
      [category, (raw[category] ?? []).map((source) => new RegExp(source, "i"))]));
  } catch {
    return {};
  }
}

const extra = local();
const patterns = Object.fromEntries(CATEGORIES.map((category) =>
  [category, [...(builtin[category] ?? []), ...(extra[category] ?? [])]]));

/** Every category the text speaks about, in a stable order. */
export function categories(text) {
  const value = String(text ?? "");
  return CATEGORIES.filter((category) => patterns[category].some((re) => re.test(value)));
}

export function classify(text) {
  return categories(text)[0] ?? null;
}

export function allowed(text, list) {
  const matched = categories(text);
  return Array.isArray(list) && matched.some((category) => list.includes(category));
}

// An anchor must carry the distinguishing content of the request, not just the
// instruction that happened to contain it. "Take over this session" is a
// generic instruction; it cannot justify recalling an unrelated project.
// Localized filler words belong in policy.local.json under "generic".
const generic = [
  "the", "this", "that", "please", "help", "continue", "handle", "take", "over",
  "session", "task", "work", "thing", "again", "now", "then", "about", "with",
  "for", "and", "can", "you", "restart", "look", "check", "confirm", "review",
];

function extraGeneric() {
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), "policy.local.json");
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(raw.generic) ? raw.generic : [];
  } catch {
    return [];
  }
}

const filler = [...generic, ...extraGeneric()].sort((a, b) => b.length - a.length);

// Script-neutral: what counts is content left after the filler is removed, in
// whatever script the user writes. Kana, Hangul, Cyrillic and the rest count
// the same way Han does, and an identifier with a digit ("Q3", "v2") counts too.
export function isSpecificAnchor(text) {
  let rest = ` ${String(text ?? "")} `;
  for (const word of filler) rest = rest.split(new RegExp(`\\b${word}\\b`, "gi")).join(" ");
  const han = (rest.match(/\p{Script=Han}/gu) ?? []).length;
  const other = (rest.match(/(?![\p{Script=Latin}\p{Script=Han}])\p{L}/gu) ?? []).length;
  const words = rest.match(/[A-Za-z]{3,}/g) ?? [];
  const identifiers = rest.match(/\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{2,}\b/g) ?? [];
  return han >= 2 || other >= 2 || words.length >= 1 || identifiers.length >= 1;
}

// Whether a word carries a matter. A record about a private matter is put forward only when the present message uses some of its words (recall.mjs),
// and that means a word with content in it: "what", "have" and "today" are in every message, and so are the pairs of letters that Japanese and
// Chinese grammar is made of. This is a list and not a judgement: it keeps the commonest words from counting, in the three languages the project is
// measured in, and whether the message really raises the matter is still decided by the step that reads it. More words: policy.local.json, "plain".
const PLAIN = new Set(`the and for are was were been being have has had having does did doing done will would shall should can could may might must not but nor yet
you your yours yourself they them their theirs there here this that these those with from into onto about over under after before again then than too very just also only
some any all each every both few more most other others such own same one two three get gets got getting make makes made making take takes took taken give gives gave given
know knows knew known think thinks thought want wants wanted need needs needed like likes liked tell tells told say says said see sees saw seen look looks looked use uses used
work works worked time times day days today tomorrow yesterday tonight now please thanks thank help helps helped good great nice new old yes yeah okay
what when where which who whom whose why how many much long often ever never always sometimes still already really maybe perhaps something anything nothing everything
someone anyone everyone thing things way ways lot lots bit kind sort out off down back away around between through during while because since until unless though although however
its his her hers him she our ours let lets going come comes came went goes put puts keep keeps kept find finds found ask asks asked try tries tried feel feels felt mean means meant
seem seems seemed call calls called show shows showed start starts started next last first second week weeks month months year years hour hours minute minutes morning evening night
write writes wrote read reads remind reminds remember remembers recall recalls happen happens happened sure right well even into upon else
don doesn didn isn aren wasn weren won wouldn couldn shouldn hasn haven hadn ain
user users assistant person people`.split(/\s+/).concat(extraList("plain")));
// Pairs of hiragana that are grammar: endings, particles and the commonest little words. A pair not listed here can still be a word of its own
// (がん, うつ), so the rest of hiragana counts.
const KANA_GRAMMAR = new Set(`です ます した して する ない から まで こと もの ので のに でも には では とは たい たら れる られ ある いる なる って った いた きた ませ せん まし でし
しょ ょう だっ たの のは のが のを のも のか んで んだ てい いま てく くだ ださ さい てる るの たち など よう うに うな そう こう どう とい いう うこ とが とを とに とも もう まだ また ただ
しか だけ ほど より なら けど けれ れど かも もし しれ ても でき きる きま あり りま おり くれ れま もら らい あげ げる はい いい よい なか かっ なく くて なけ れば ばい すか すが すね すよ
たか たね たよ るか るね るよ だね だよ だろ ろう これ それ あれ どれ ここ そこ あそ どこ この その あの どの こん そん あん どん んな わた たし あな なた ぼく おれ さん ちゃ ゃん くん とき
ため ほう とこ ころ みた らし しい につ つい いて によ よる よっ にお おけ ける とし にな なっ なり にし をし をす がで があ もあ はな はあ いつ なに なぜ だれ いく くつ くら どち ちら
てお おく おき てみ みる みて てあ てし しま まう まっ じゃ ゃな なの のだ のよ のね わね かな かし しら だか かり ばか まり あま とて すご ごく ちょ ょっ っと もっ ずっ きっ
たぶ ぶん おそ そら らく やは はり やっ ぱり さら らに すで でに まず ずは つま ろで そし れで れは れが れを れに れも れか こそ さえ すら てま
りが がと とう うご ござ ざい おは はよ んに にち ちは んば ばん おや やす すみ おね ねが がい よろ ろし しく んの のこ とな んな にも はも にか はい えば たり たっ てき`.split(/\s+/).concat(extraList("plain")));
// Pairs of Han that are pronouns, question words, time words and connectives in Chinese and Japanese.
const HAN_PAIRS = new Set(`什么 怎么 怎样 这个 那个 哪个 这些 那些 这样 那样 这里 那里 哪里 我们 你们 他们 她们 它们 自己 大家 没有 不是 就是 还是 但是 可是 因为 所以 如果 虽然
然后 而且 或者 已经 正在 可以 可能 应该 需要 想要 知道 觉得 认为 希望 喜欢 时候 现在 今天 明天 昨天 今年 明年 去年 上午 下午 晚上 早上 最近 以前 以后 之前 之后 一个 一些
一下 一起 一直 一样 很多 非常 真的 多少 几个 东西 事情 问题 时间 请问 谢谢 你好 是否 能否 还有 只是 只有 不要 不会 不能 不用 告诉 帮我 帮忙 一点 有点
什麼 怎麼 怎樣 這個 那個 哪個 這些 那些 這樣 那樣 這裡 那裡 哪裡 我們 你們 他們 沒有 還是 因為 雖然 然後 已經 應該 覺得 認為 時候 現在 東西 問題 時間 請問 謝謝 還有
告訴 幫我 幫忙 一點 有點 一個 一樣 幾個
今日 明日 昨日 今週 来週 先週 今月 来月 先月 来年 毎日 毎週 毎月 毎年 時間 何時 自分 一緒 本当 今度 大丈 丈夫 必要 場合 以後 午前 午後 今夜 今朝 今晩 質問 今回 前回
次回 一番 一度 一人 二人 何人 何日 何回 何度 全部 一部 最初 最後 途中 同時 普通 結構 多分 絶対 是非
用户 用戶 助手 本人`.split(/\s+/).concat(extraList("plain")));
// Han that is grammar by itself: beside another of these, or beside a kana, it makes no word that carries a matter (我的, 私は, 何を, 前に).
const HAN_FUNCTION = new Set([..."我你您他她它们們這这那哪谁誰是的了在有和不没沒也都就还還很吗嗎呢吧啊着著过過把被给給让讓对對从從向到为為以而或与與及其之于於个個些每某本该該此想要会會能可去来來说說看做用得地私僕俺君彼何今時日月年事物方人前後中上下間毎分度回次先"]);
function extraList(name) {
  try { const raw = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "policy.local.json"), "utf8")); return Array.isArray(raw[name]) ? raw[name].map(String) : []; } catch { return []; }
}
/** A word as a sentence leaves it, without the stops and marks at its ends ("them." is "them"). */
export const bareWord = term => String(term ?? "").toLocaleLowerCase().replace(/^[._/:\-]+|[._/:\-]+$/g, "");
/** Whether one word (as terms() in mind.mjs gives them: a run of letters, or a pair of Han or kana) can be what raises a private matter. */
export function matterWord(term) {
  const t = bareWord(term);
  if (!t) return false;
  if (/^[a-z]+$/.test(t)) return t.length >= 3 && !PLAIN.has(t);
  // A number alone says little (the 000 of 1,000 is in every price): four digits or more that are not all noughts.
  if (/^\d+$/.test(t)) return t.length >= 4 && !/^0+$/.test(t);
  const chars = [...t];
  if (chars.some(c => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c))) {
    // Han and hiragana are looked at a pair at a time (a longer run is a phrase, and its pairs come one by one). A word in katakana is taken
    // whole, in recall.mjs: its pairs are in too many other words (ーン is in ローン and in パターン).
    if (chars.length !== 2 || chars.some(c => /\p{Script=Katakana}/u.test(c)) || t.includes("ー")) return false;
    const han = chars.filter(c => /\p{Script=Han}/u.test(c));
    if (!han.length) return chars.every(c => /\p{Script=Hiragana}/u.test(c)) && !KANA_GRAMMAR.has(t);
    if (han.length === 2) return !HAN_PAIRS.has(t) && han.some(c => !HAN_FUNCTION.has(c));
    return !HAN_FUNCTION.has(han[0]);
  }
  // Words with a digit or a mark inside them, Latin with accents, and every other script: by their letters.
  const letters = t.replace(/[^\p{L}\p{N}]/gu, "");
  if (/\d/.test(letters)) return /\p{L}/u.test(letters) && [...letters].length >= 2;
  return [...letters].length >= 3 && !PLAIN.has(letters) && !PLAIN.has(t);
}

// The shape of a secret, whatever the language around it.
const SECRET = [
  /\bsk-[A-Za-z0-9_-]{8,}/,
  /\b(?:password|passphrase|secret|token|api[ _-]?key)\s*[:=]\s*\S{6,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
export const secret = (text) => SECRET.some((re) => re.test(String(text ?? "")));

/**
 * The categories a record carries. `named` is what the model that read the
 * turn said; when it said nothing, what the record carried before stands, and
 * failing that the word list reads the user's own words (never the model's
 * paraphrase of them: "a bug diagnosis" is not a health matter).
 */
export function sensitivity(named, before, said, everything) {
  const from = Array.isArray(named) ? named.filter((c) => CATEGORIES.includes(c))
    : Array.isArray(before) ? before : categories(said);
  const found = new Set([...from, ...(secret(everything) ? ["credentials"] : [])]);
  return CATEGORIES.filter((c) => found.has(c));
}
