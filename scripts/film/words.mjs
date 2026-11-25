// What is said in each film, and when. One film for each of three languages, each its own story: what moves a person is not the same everywhere.
// They share a shape, because the shape is what Asteme does: a worry at night; something said long ago comes back by its situation, in other words;
// the person opens it and sees their own sentence and the day they said it; Asteme offers to ask later; days pass; at that time it speaks first; and
// everything ever said about the one thing gathers out of the sky. Made up, all of it: nobody's real conversation.
export const LANGS = ["en", "zh", "ja"];

// What the person types. A string is typed key by key; a list is typed through an input method, one phrase at a time: [what the keys spell, what is
// committed], so the underlined reading shows before the words do, as it does on a real keyboard.
export const FILMS = {
  en: {
    lang: "en",
    locale: "en-US",
    tz: "America/New_York",
    cjk: "Noto Sans CJK JP",
    title: "Someone you talk to, and the same one each time.",
    end: "github.com/asteme/asteme",
    night: "2026-11-17T23:10:00-05:00",
    later: "2026-11-21T09:00:00-05:00",
    yesterday: "2026-11-16T23:02:00-05:00",
    before: ["Calling it a night", "Sleep well."],
    composer: "Birthday today. ",
    hesitate: "It's fine",
    settle: "Feels like time's running out.",
    recall: "Happy birthday. Three years ago you said: “If I haven't started the book by forty, remind me who I was.”",
    memory: [
      {
        text: "If I haven't started the book by forty, remind me who I was",
        quote: "Turning thirty-seven on Friday. If I haven't started the book by forty, remind me who I was.",
        at: "2023-11-14T23:52:00-05:00",
      },
    ],
    react: "…I said that?",
    reactAnswer: "You did.",
    promise: "Saturday morning, I'll ask how it's going.",
    why: "Ask how the book is going",
    when: "Saturday, 9:00 AM",
    first: ["Good morning.", "How's the book?"],
    answer: "Two pages. They're bad",
    answerReply: "Two pages exist now. On your birthday there were none.",
    won: "Wrote the first two pages of the book",
    seek: "book",
    found: ["The book is about my grandfather's boat", "I outlined the book once, on a train to Boston", "Grandpa would've read the book twice"],
    captions: ["The situation recalls, not the wording.", "It keeps promises.", "It shows what it remembers."],
  },
  ja: {
    lang: "ja",
    locale: "ja-JP",
    tz: "Asia/Tokyo",
    cjk: "Noto Sans CJK JP",
    title: "話しかける相手。いつも同じ一人。",
    end: "github.com/asteme/asteme",
    night: "2026-11-10T23:10:00+09:00",
    later: "2026-11-22T19:00:00+09:00",
    yesterday: "2026-11-09T23:02:00+09:00",
    before: ["今日はもう寝る", "おやすみ。"],
    composer: "来週、親が来る。",
    hesitate: [["べつに", "別に"], ["たいした", "大した"], ["ことないけど", "ことないけど"]],
    settle: [["ひさびさで", "久々で"], ["、", "、"], ["ちょっと", "ちょっと"], ["きんちょうする", "緊張する"]],
    recall: "お母さん、膝が悪くなったって言ってたね。駅は東口ならエレベーターがあるよ。",
    memory: [
      { text: "母は膝が悪く、階段がつらい", quote: "母の膝がまた悪くなったらしい。階段がいちばんつらいって", at: "2025-04-12T22:31:00+09:00", uses: { helped: 1 } },
      { text: "最寄り駅でエレベーターがあるのは東口だけ", quote: "うちの駅、エレベーターが東口にしかないの不便すぎる", at: "2024-09-03T08:12:00+09:00" },
    ],
    react: [["…", "…"], ["そんなことまで", "そんなことまで"], ["おぼえてたの", "覚えてたの"]],
    reactAnswer: "話してくれたから。",
    promise: "来週の日曜の夜、どうだったか聞くね。",
    why: "親が来てどうだったか聞く",
    when: "日曜日 19:00",
    first: ["おつかれさま。", "お母さんたち、どうだった？"],
    answer: [["かえりぎわ", "帰り際"], ["、", "、"], ["げんきなら", "元気なら"], ["それでいい", "それでいい"], ["って", "って"], ["。", "。"], ["いつもの", "いつもの"]],
    answerReply: "お母さんらしいね。",
    won: "母は帰り際に「元気ならそれでいい」と言った",
    seek: [["はは", "母"]],
    found: ["母の誕生日は3月9日", "母は電話より手紙が好き", "母が編んだマフラー、まだ使っている"],
    captions: ["言葉ではなく、場面が思い出させる。", "約束を守る。", "覚えていることを見せる。"],
  },
  zh: {
    lang: "zh",
    locale: "zh-CN",
    tz: "Asia/Shanghai",
    cjk: "Noto Sans CJK SC",
    title: "一个可以交谈的对象，每次都是同一个。",
    end: "github.com/asteme/asteme",
    night: "2027-01-19T23:10:00+08:00",
    later: "2027-01-22T20:30:00+08:00",
    yesterday: "2027-01-18T23:02:00+08:00",
    before: ["先睡了", "晚安。"],
    composer: "快过年了。",
    hesitate: [["jin nian", "今年"], ["ke neng", "可能"], ["you", "又"]],
    settle: [["nian jia", "年假"], ["hai mei", "还没"], ["pi xia lai", "批下来"], ["，", "，"], ["zhou wu", "周五"], ["cai zhi dao", "才知道"]],
    recall: "去年除夕，你说春联是你爸自己踩着凳子贴的，贴歪了。",
    memory: [{ text: "家里的春联是爸自己贴的，贴歪了", quote: "春联是我爸自己踩着凳子贴的，贴歪了。明年我回家贴", at: "2026-02-16T23:40:00+08:00" }],
    react: [["……", "……"], ["zhe", "这"], ["ni dou", "你都"], ["ji de", "记得"]],
    reactAnswer: "你说过的。",
    promise: "周五晚上，我来问你。",
    why: "问年假批下来没有",
    when: "周五 20:30",
    first: ["周五了。", "年假批下来了吗？"],
    answer: [["pi xia lai le", "批下来了"], ["。", "。"], ["qiang dao le", "抢到了"], ["la yue", "腊月"], ["er shi ba", "二十八"], ["de piao", "的票"]],
    answerReply: "好。今年的春联你来贴。",
    won: "年假批了，腊月二十八回家",
    seek: [["jia", "家"]],
    found: ["来深圳这些年，搬了五次家", "妈总在电话里说家里都好", "爸把我回家的日子圈在挂历上"],
    captions: ["唤起记忆的是情形，不是字面。", "它会守约。", "它记得什么，你都看得见。"],
  },
};

// The rest of the person's sky: their own life, and the few things they have learned from it. Filled in sky/<lang>.json beside this file.
export const committed = (typed) => (Array.isArray(typed) ? typed.map(([, w]) => w).join("") : typed);

// How long a hand takes. Latin keys come about ten a second, in bursts within words, slower at spaces and after punctuation; an input method types
// its reading a little faster and stops to convert each phrase.
const LATIN = { key: 0.085, space: 0.07, mark: 0.22 };
const IME = { kana: 0.1, letter: 0.075, convert: 0.32, commit: 0.12 };
export const typingTime = (typed) =>
  Array.isArray(typed)
    ? typed.reduce((t, [reading, word]) => t + (reading === word ? 0.18 * [...word].length : [...reading.replace(/ /g, "")].length * (/^[a-z ]+$/.test(reading) ? IME.letter : IME.kana) + IME.convert + IME.commit), 0)
    : [...typed].reduce((t, c) => t + LATIN.key + (c === " " ? LATIN.space : /[.,?!…:;]/.test(c) ? LATIN.mark : 0), 0);

// The film laid out from the first frame, as a person would do it: a moment to read what was said, a breath before Enter, a beat of stillness after
// something lands. The moments the music meets (the recall, the memory docking, the dimming, the first word after the days, the landing among the stars,
// the first and last found lines, the end of the pull back) are named, and the score is written to them.
export function direct(lang) {
  const F = FILMS[lang],
    T = {};
  let t = 0;
  const at = (name, dt = 0) => (T[name] = +(t += dt).toFixed(3));
  const span = (name, typed, gap = 0) => {
    t += gap;
    T[name] = [+t.toFixed(3), +(t += typingTime(typed)).toFixed(3)];
  };
  const wordy = (s) => [...committed(s)].length;
  const read = (s) => Math.min(3.4, 0.9 + wordy(s) * (lang === "en" ? 0.028 : 0.07));
  at("rise");
  span("hesitate", F.hesitate, 0.9);
  at("erase", 1.0);
  t += 0.45;
  span("settle", F.settle, 0.35);
  at("send1", 0.45);
  at("dots1", 0.5);
  at("recall", 1.1);
  // The person reads it, and reaches for the star the line runs from: their own sentence, and the day they said it, open beside tonight's.
  t += read(F.recall);
  at("reach");
  at("hover", 1.0);
  at("open", 0.7);
  at("dock", 0.35);
  at("cap1", 0.9);
  at("cap1off", 4.0);
  at("close", 0.6);
  span("react", F.react, 0.5);
  at("send2", 0.45);
  at("dots2", 0.45);
  at("reactAnswer", 0.8);
  at("dots3", 0.9);
  at("promise", 0.9);
  t += read(F.promise) + 0.6;
  at("dim");
  at("whenOn", 0.7);
  at("turn", 1.0);
  at("whenOff", 1.6);
  at("undim", 0.2);
  at("dots4", 1.4);
  at("first1", 0.9);
  at("first2", 1.3);
  at("cap2", 0.9);
  span("answer", F.answer, 0.4);
  at("cap2off", 0.1);
  at("send3", 0.4);
  at("dots5", 0.5);
  at("answerReply", 0.9);
  at("star", 0.6);
  at("toSky", 1.9);
  at("dblclick", 0.9);
  at("land", 1.9);
  at("cap3", 0.4);
  span("seek", F.seek, 0.6);
  at("cap3off", 1.2);
  const steps = [0.95, 0.95, 1.45, 1.9];
  T.lines = [];
  t = T.seek[1] + 0.55;
  T.lines.push(+t.toFixed(3));
  for (const s of steps) T.lines.push(+(t += s).toFixed(3));
  at("release", 2.4);
  at("pull", 0.5);
  at("pulled", 2.7);
  at("name", -1.0);
  at("stop", 3.5);
  // The frame the README shows before anyone presses play: tonight's message and the recall on the left, the memory and the sentence it rests on
  // docked on the right, and the first line of words over it.
  T.poster = +(T.cap1 + 1.2).toFixed(3);
  return T;
}

// The scene the preview starts from: the person's memories that matter in this story, with the days they were said, and the sky of the rest.
export function story(lang, sky) {
  const F = FILMS[lang],
    y = Date.parse(F.yesterday);
  // A star stands where its id puts it. The one the person reaches for is given an id that stands in the clear, to the left of the conversation, so
  // that the pointer resting on it rests on nothing else.
  const told = F.memory.map((m, i) => ({ id: i ? "m" + i : "m3843", text: m.text, quote: m.quote, at: Date.parse(m.at), strength: 0.93, ...(m.uses ? { uses: m.uses } : {}) }));
  const years = [400, 730, 1100];
  const more = F.found.map((text, i) => ({ id: "f" + i, text, quote: text, at: y - years[i] * 86400000, strength: 0.9 }));
  return {
    name: "Asteme",
    you: "",
    intentions: [],
    lessons: sky.lessons,
    fill: sky.memories,
    // The found ones come in the order they are listed: the one recalled tonight first, then the others back through the years.
    memories: [told[0], ...more, ...told.slice(1)],
    messages: [
      { id: "b0", role: "user", text: F.before[0], at: y, read: y + 20000 },
      { id: "b1", role: "assistant", text: F.before[1], at: y + 30000 },
    ],
  };
}
