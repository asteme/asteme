// Three films, one for each language, and each its own story: what moves a person is not the same everywhere.
//   ja: a mother who lives far away, and what is never quite said between a parent and a grown child.
//   en: a promise made to oneself and put off, and being called back to it by one's own words.
//   zh: going home for the New Year, from a city far from one's parents.
// They share a shape (a worry at night; something said long ago comes back; days pass; it speaks first; and then everything ever said about the one thing
// that matters gathers out of the sky), because that shape is what Asteme does. Made up: nobody's real conversation.
export const WORDS = {
  ja: { lang: "ja", locale: "ja-JP", night: "2026-11-14T23:10:00+09:00", back: "2026-11-23T20:30:00+09:00",
    before: [["user", "今日はもう寝る"], ["assistant", "おやすみ。"]],
    typeA: "来週、母がこっちに来る。", hesitate: "別に普通だけど", settle: "久しぶりで、少し緊張する",
    a1: "来週なんだね。", a2: "お母さん、膝が悪いって言っていたよね。駅は階段の少ない東口がいいと思う。",
    say2: "…そんなことまで覚えてるの", a3: "あなたが話してくれたことだから。",
    b1: "おかえり。", b2: "お母さん、どうだった？", say3: "帰り際に「元気ならそれでいい」って。いつもと同じ", b3: "うん。前にも聞いた言葉だね。",
    say4: "母のこと、他に何を覚えてる？", b4: "見てみる？", seek: "母",
    won: "母は帰り際に「元気ならそれでいい」と言った",
    about: ["母は膝が悪いから、階段の少ない道を選ぶ", "母の誕生日は三月九日", "母は電話より手紙が好き", "母の味噌汁は、いつも少し薄い", "母に仕事の話をすると心配させる", "母の庭の柿、今年はたくさん実った", "母に最後に会ったのは去年の秋", "母は「元気ならそれでいい」としか言わない", "母が編んだマフラー、まだ使っている"],
    lessons: ["忙しい相手には結論を先に", "決めたことは書き残すと続く", "迷ったら大事なことから", "決める前に一晩おく", "短い散歩で頭が晴れる"],
    fill: ["朝のうちに難しい仕事を片づける", "会議の前に論点を三つに絞る", "週の終わりに振り返りを書く", "返信は短く、要件を先に", "見積もりは二割多めに見る", "数字には出どころを添える", "金曜の午後は予定を入れない", "コーヒーは午後三時まで", "傘は玄関の左に置く", "通勤は一本早い電車にする"] },
  en: { lang: "en", locale: "en-US", night: "2026-11-18T23:10:00+09:00", back: "2026-11-21T08:10:00+09:00",
    before: [["user", "Calling it a night"], ["assistant", "Sleep well."]],
    typeA: "Turned forty today. ", hesitate: "It's fine", settle: "Feels like I'm running out of time",
    a1: "Happy birthday.", a2: "Three years ago you told me: “If I haven't started the book by forty, remind me who I was.”",
    say2: "…I said that?", a3: "You did. I kept it for today.",
    b1: "Good morning.", b2: "It's Saturday. You said Saturdays would be for the book.", say3: "I wrote two pages. They're bad", b3: "Two pages exist now. Yesterday there were none.",
    say4: "What else did I say about it?", b4: "Come and see.", seek: "book",
    won: "Wrote the first two pages of the book",
    about: ["If I haven't started the book by forty, remind me who I was", "The book is about my grandfather's boat", "I outlined the book once, on a train to Leeds", "Nobody is waiting for the book but me", "The first line of the book came to me in the shower", "I told Anna about the book and she didn't laugh", "I want to finish the book before the kids are grown", "Every January I say this is the year of the book", "If I never write the book, I will always wonder"],
    lessons: ["For a busy reader, the decision first", "What is decided lasts when written down", "When unsure, start with what matters", "Sleep on it before deciding", "A short walk clears the head"],
    fill: ["Do the hard work in the morning", "Three points before any meeting", "Write a review at the end of the week", "Short replies, the ask first", "Add a fifth to every estimate", "A number comes with its source", "Keep Friday afternoon free", "No coffee after three", "Keys go on the hook by the door", "Take the earlier train"] },
  zh: { lang: "zh", locale: "zh-CN", night: "2027-01-18T23:10:00+09:00", back: "2027-01-22T20:30:00+09:00",
    before: [["user", "今天先到这儿"], ["assistant", "早点休息。"]],
    typeA: "快过年了。", hesitate: "今年可能不回去了", settle: "想回家，又怕请不下假",
    a1: "是啊，快过年了。", a2: "去年你说过：“明年无论如何要回家，爸的腰不好，春联贴不上去了。”",
    say2: "……这你都记得", a3: "是你亲口说的。",
    b1: "你回来了。", b2: "假请下来了吗？", say3: "请下来了。腊月二十八的票", b3: "太好了。这个我也记下了。",
    say4: "关于家，我还说过什么？", b4: "来看看。", seek: "家",
    won: "腊月二十八回家的票买好了",
    about: ["明年无论如何要回家，爸的腰不好", "家里的饺子是韭菜鸡蛋馅", "妈总在电话里说家里都好", "家门口那棵槐树还在", "爸说不用惦记家里", "离家那年我二十二岁", "一到腊月就想家", "给家里换了新的热水器", "回家的路，我一直记得"],
    lessons: ["对忙碌的人，先说结论", "决定的事写下来才能坚持", "拿不准时，从要紧的开始", "做决定前先放一晚", "散一会儿步，头脑更清楚"],
    fill: ["上午先做难的工作", "开会前把要点缩成三条", "周末写一份回顾", "回复要短，先说要求", "估算多留两成", "数字要注明出处", "周五下午不排事情", "下午三点后不喝咖啡", "钥匙放在门边的挂钩上", "坐早一班的地铁"] },
};
// When each thing happens, in seconds. One beat is one second and a bar is four: what Asteme says lands on a beat, and the score is written to the same clock.
export const T = { fadeIn: 0.2, typeA: [2.0, 3.7], hesitate: [4.5, 5.5], erase: [6.2, 6.7], settle: [7.0, 8.5], send1: 9.0, dots1: 12.4, a1: 14.0, a2: 16.0,
  type2: [19.2, 20.1], send2: 20.5, dots3: 21.1, a3: 22.0, dim: 24.0, turnDay: 25.3, undim: 26.0, dots4: 28.0, b1: 29.0, b2: 31.0,
  type3: [32.8, 35.4], send3: 35.8, dots6: 36.7, b3: 38.0, star: 38.8, type4: [40.0, 41.6], send4: 42.0, dots7: 42.7, b4: 44.0,
  space: 46.0, drift: [48.2, 51.4], seek: [52.0, 52.5], lines: 54.0, lastLine: 62.0, release: 65.0, pull: [66.0, 68.6], end: 70.0, out: 73.0, stop: 74.3 };
