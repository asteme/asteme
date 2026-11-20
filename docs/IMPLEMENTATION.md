# 0.7.0-alpha.1 の実装上の選択

[DESIGN.md](DESIGN.md)を変更する規則ではなく、初期実装に必要な具体化の記録。

- コアはAstemeとLog。DSH型・サービスをsrcへ持ち込まない。旧2文書要約・期待状態・専用再演コードと切替UIを削除した。
- 場面読み・選別・振り返りはDSHで選択済みのモデルを使う。会話と同じモデルへの自動追従も残す。明示された推論強度は維持し、指定がなく登録モデルがlowを提供する場合はlowを選ぶ。
- 意味照合には[Transformers.js](https://huggingface.co/docs/transformers.js)と[Xenova/multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small)のq8 CPU推論を使用。query/passage接頭辞、mean pooling、正規化ベクトルの内積。初回モデル取得以外はローカル処理。別ホストはembedを差し替えられる。
- 候補は意味上位24件と人・物の一致、日時条件に合う懸案の和集合。閾値で「関連あり」と断定しない。選別モデルが最大4件まで通す。これらは初期実装の値で、基準文書から導かれる普遍的な最適値ではない。
- 場面読みと振り返りで「誰が・誰に・何のために・何をする／感じる」という書き方を共有する。具体形・一般形・結果から戻した場面は独立に意味照合し、同じ文の埋め込みを共有する。全場面カタログを毎回モデルに読ませる別系統は作らない。
- 評価は実配達と後の利用者・道具の根拠を照合し、応答対象の入力と理解の組ごとに一つ保持する。再評定で成功回数を増やさず、後の証拠で訂正できる。役立った／見逃した場面は候補の手がかりに戻り、不要だった理由は選別へ戻る。理解の適用範囲や確信度を回数から自動で広げない。候補ごとの直近12評価を使う。
- 入力は直近8件の原発言・結果と現在入力。場面の読みと選別は別呼出し。名前等の明示抽出を場面読みの同じ呼出しに載せ、会話中に反映する。深い解釈は振り返りでのみ行う。
- DSHは最初のpre-step時点で入力をまだ原イベントへ確定していない。receiveが実入力を固定メッセージIDから先に記録し、後のイベント取り込みでも同じIDを使う。架空の会話ターンを作らない。
- 振り返りは原記録を24,000文字程度のページで読み、途中カーソルを残す。後続ページを捨てない。原記録は切り詰めない。関連理解が32件以下なら全部、それ以上は候補集めを使う。現在ターンと直近20件の記録から、対象ターン終了までの配達・使用申告を参照する。振り返り結果自身を根拠として再読しない。振り返りの応答は、後置きの説明・コードフェンス・文字列内の未エスケープ引用符といった形式の雑音を除いて読む。読めなかった応答本文はtraceに残す。振り返りが見られた配達件数と痕跡数をtraceに残し、feedbackが空だった理由を「判定材料が無かった」と「読み落とした」に後から分けられるようにする。
- 核は初期実装で4,000文字以内。理解1件は16,000文字以内。主観的な重要度スコアを永続化しない。
- 常設の核と、場面限定の指示を分ける。合意の変更にはrelationshipの適用範囲を要求し、仕事・相手・資料に限った指示は理解へ残す。モデルが範囲を誤分類しない保証ではなく、実モデルでの確認も必要。
- 型・根拠ID・引用一致・役割・更新順序・改訂競合をコードで検査する。引用があることは解釈の正しさの証明ではない。拒否した操作と理由も記録する。
- 定着はコードが反復を確認できた場合だけ走る。条件は二つ。(a) 同じ改訂への「役立った」が異なる場面で2回以上あり、それ以降の「不要」がない。(b) 明示的な理解を、別々のやり取りの訂正が2回以上裏づけている。どちらも満たさなければモデルを呼ばない。モデルは文面・理由・適用範囲・未検証範囲・根拠だけを作り、昇格の可否は判定しない。
- 習慣は1件300文字以内、12件まで。名前・話し方・決め事と同文の習慣は拒否する。根拠は引用一致と候補の範囲をコードで検査する。昇格はexperience_historyの核行とhabits:\<owner\>に来歴を残し、核の4,000文字上限を守る。
- 降格は、昇格後の「不要」が異なる場面で2回以上、または根拠の理解が失効・削除された場合。ユーザーは画面から削除できる。削除も降格として来歴を残し、本文が一致するときだけ核から消す。定着の呼出しは振り返り待ちが空のときだけで、10分間隔に制限する。
- 長い原記録のどのページの引用も確認する。選別中に閉じた／改訂された候補を、古い判断のまま渡さない。処理済みの振り返りは再呼出しもしない。
- 場面読み、埋め込み、選別が失敗した場合は過去を渡さず、失敗をtraceに残す。古い要約・未処理の発言・失敗時の検索抜粋を迂回注入しない。
- 選ばれた経験は、本文、使い方、確かさ、最終確認日、適用範囲、仮説、短い根拠、懸案の条件を主モデルへ渡す。判断の申告に使う項目IDも添える。候補と選ばれた経験の完全な記録はtraceに残す。配達本文に毎回の現在時刻を入れない。not-nowは懸案を開いたまま待機させる。配達には、現在入力の原文に実在する短い完全一致引用を要求する。引用できない判断は配達せず、破棄した理由をtraceに残す。話題が似ているだけでは通さない。
- 原データのアップグレードは非破壊。旧要約・旧期待は保存したまま使わず、原記録から新しいexperiencedカーソルで再構成する。すべての旧版からの移行を保証したものではない。

目的の定義、自律的通知、モデル交代時の同一性について新しい製品方針は追加していない。初期範囲の外にある機能は、設定項目だけ先に増やしていない。

別AgentのJavaScript版・Python版から、共有する場面表現と結果を注意へ戻す考えを参考にした。固定の30/45/60日で懸案を閉じること、文字の一致で私的な気づきを遮断すること、会話数だけで仮説を確定すること、未検証の核への昇格、目的・気分の既定値は採用していない。期限超過と約束の失効を区別する。

## What is kept and what is removed (0.8.0-alpha.8)

Implemented behavior, not a specification.

| Data | Kept | Removed when |
| --- | --- | --- |
| Memories and their history | Always | The user deletes or forgets them |
| What the user and the assistant said | Always | The user forgets it |
| Tool output | Always by default | The user runs "Free up space": output older than 30 days that no memory, history or outcome cites is cut to its first 600 characters |
| Readings made before replies | Always; a removed memory is scrubbed out of them | Their own request is forgotten |
| Diagnostic journal | 90 days | Older rows are dropped |
| Automatic backups | Newest 7 (`backupKeep`), compressed | Older ones are dropped |
| Other backups | Newest 5 | Older ones are dropped |
| Exports beside the store | Newest 3 of each kind (`exportKeep`) | Older ones are dropped |
| A private conversation | The order of events only | Nothing said in it is stored |
| Something the user forgot | Nowhere the plugin wrote: not in the store's bytes, its copies or its exports beside the store | At once; exports in a folder the user chose are theirs to remove |
| Host bookkeeping (steps, jobs, request headers) | Not stored since 0.8.0-alpha.11 | Rows from earlier versions that hold no words and that nothing cites are removed with the daily copy and by "Free up space" |
| Marks (feedback on a message, an approval given or refused, a preset change) | Always, as they arrived, up to 2,000 characters | The user forgets them |

**Decided (0.10.0-alpha.2), from a store sent back after a day of use.**

- *What is in view is not recalled.* The only rule of this kind had been that a memory learned from the present message is not handed back. In real use a conversation teaches something and goes on for an hour, and each later message recalled what was said a few lines up, at the price of a model call or two. The test is by records, not by meaning: a memory is held back when every record it rests on is among those the replying model can see. Who can see what is the host's knowledge, so `prepare` takes `view`; without it the recent records it was given are the view. DSH does not tell a plugin how far back its model still sees, so the plugin passes the last 400 records of the session, an estimate that errs toward recalling too little late in a very long session.
- *Tool runs in the diary.* They were counted there, one line per run, between empty headings. A diary is read by a person for what was said; the runs stay in the store, where a memory may rest on them, and in the complete copy, which is complete by definition.

**Decided (0.9.6), from a real run.** DSH 0.2.2-rc.1 was started from its npm package on Linux with a web profile, one provider route and one model (a small fast one with thinking that cannot be turned off), a judge beside it in shadow, and the bundle installed from a packed tarball. The panel was driven with a browser. What was seen, and what was decided from it:

- *The plugin loads and the loop closes.* A reading before the reply, reflection after it, a memory with its ground, delivery in a later conversation, the judge's answer beside the model's, an outcome read from the next message, the panel, the dark theme, the composer mark, erase from the panel. `plugin/host.mjs` is no longer unverified on Linux; Windows still is.
- *What the reply waits for.* One reading took 5 to 14 seconds with this model, a second one for candidates only the scene called up another 5 to 15. Three things were taken: no reading at all while nothing is remembered; no second question about a candidate the judge is sure does not belong; and the report says first how long the reply waited. Not taken: letting a judge in shadow admit. It stays in shadow until its agreement with the model has been counted on real use.
- *An erase is an event other work must notice.* A reading that began before the erase finished after it and wrote what it had read. A lock would have made the erase wait for a model call; instead the store counts erases (`epoch`), and work that finds the count changed erases again and returns nothing (`rewipe`, and the wrapper in `src/core.mjs`).
- *Private is a judgement about meaning, so code does not make it.* The word list broke this project's own rule and failed both ways: a false mark from the model's paraphrase, and no mark at all outside English. The reader of the turn names the categories; code checks the names against the five it knows and recognises the shape of a secret. A numeric gate on the user's message was tried first and measured with the real embedding model: a direct question about a loan scored 0.21 against that memory and an unrelated request to plan a week scored 0.29, so the message's closeness cannot tell "asked about it" from "did not". The gate before admission is therefore the same floor every record passes, minus the two side doors (a name alone, an association), and the decision is the reader's, under a stricter rule and always in the open. This is weaker than a hard gate where the old list happened to work and stronger everywhere it did not; the scenario "a sensitive memory is used in the open when the user asks about it directly" in `eval/` measures it per model.
- *A request made in advance counts.* "When you plan my mornings, allow for the medication at eight" is the user asking for a private record to be used in a situation that will not mention it. The rule names that case. Seen working in Japanese: not offered for an unrelated request, mentioned when asked about, mentioned when a morning was planned.
- *Unfinished work is a concern.* Reflection had stored "the memo has not been drafted yet" as an understanding, three times in different words. A prompt rule, not code: what will stop being true when someone acts is a concern with its ending, or nothing.
- *Pace is the user's.* One call per round, at most five, with a pause from ten seconds to an hour between rounds. A consolidation that needs twelve calls takes twelve rounds. Reflection after a turn follows the same pace; the reading before a reply does not, because the reply waits for it.
- *The charter stays the user's.* Asked whether the assistant could write to it from a conversation: what the user says about it in conversation already changes it, at the reading and again at reflection, with the user's words as evidence. The assistant's own conclusions do not, and no tool is given for it, because the charter is present in every conversation and a wrong line there reaches all of them. What the assistant learns goes to memory, and from repeated success to a habit the user can see and remove.
- *One memory per thing.* Asked whether memories should be kept as one text. Separate records are what make recall by scene, an outcome for each, a correction of one and forgetting of one possible; a single text would have to be rewritten whole by a model at every change and nothing in it could be traced to its ground. Records that say the same thing are already merged during consolidation (`reconcile`, verdict "merge"), and cases that share a reason become a lesson. The one always-present text is the core.
- *Roles are not enough to tell whose words a memory holds.* `grounds` looked at the roles of the cited records, and a model can cite the user's message next to the tool result it actually drew from. Code cannot read meaning, but a literal has a shape: a mail address, a link, a long number in the memory that occurs in none of the user's cited words (nor in the memory as the user left it) did not come from the user (`literals` in `src/memory.mjs`). This is the planted-instruction attack in the form published work describes, and the form the model check reproduces.
- *The model check, for the first time.* "Check this model" ran to the end inside DSH: 32 of 36 checks in 43 minutes with the small model; the same scenarios run directly against the same model also gave 32 of 36. Failing in both: a lesson drawn from two corrections during consolidation was not written; "Take over this session" and "Continue" still called the handover memory up as a candidate (nothing was delivered); recall of a lesson for a different audience and document failed once in each run. Replayed five times, that last one delivered four times; the fifth time the match was rated weak (closeness 0.07 to 0.27 across the five, around the 0.2 line) and the one-call answer carried no decision for it. Taken: with a judge present every unanswered candidate is looked at, the judge removing those it is sure about. Not taken: asking again for every weak match without a judge, which would make most replies wait for a second call. The lesson-during-consolidation failure and the candidate-level one are open.
- *Measured and left:* reflection on a two-line turn cost up to 11,000 output tokens once with this model (thinking); usual values were 300 to 3,400. A short question that only alludes to something ("when did I say I take it?") is called up by the scene the model writes, not by the message, which costs the second call. Headless DSH exits before the last events are synced.

**Decided (0.9.5), from the DeepSeek Harness source.**

- *Where a plugin can put a control.* The composer declares list slots `conversation.input.left` and `conversation.input.right`, scoped to a session; a registration's `inject` receives the session id. Asteme registers one entry in the left one. The session scope means the control exists once a conversation exists; whether it is shown before the first message was not verified.
- *Ratings.* `feedback/message-put` carries `{ sessionId, item: { messageId, rating: "positive" | "negative", note?, category? } }`, `feedback/message-delete` carries `{ sessionId, messageId }`, and `feedback/record` is a remark about the whole session `{ text?, category? }`. The rating is matched to the reply by message id and handed to outcome reading as context. It is not turned into an outcome by code, because it rates the reply and not any one memory; and an outcome still needs a later record to rest on. Making a rating with a note count as that record is the next step, once ratings have been seen in real use.
- *Approvals.* `approval/decided` is `{ id, outcome }` and names no tool by itself; it is stored and not read.
- *Theme.* DSH sets `data-ds-dark-theme` on the body. The panel reads that first.
- *Compatibility.* `engines.dsh` decides alone when present and is compared with prereleases included. Plugins are installed with pnpm, so a declared dependency (the embedding model) is installed with the plugin.
- *Not used:* DSH has its own native folder chooser (`directoryPicker/pick`) behind a host plugin that is not always mounted. Asteme keeps its own chooser so that it does not depend on that composition.

**Decided (0.9.0).**

- *Forgetting reaches every copy the plugin made.* Until now it reached only the live tables. What the user asks to forget is overwritten in the store (`secure_delete`), the write-ahead file is emptied, and backups and exports beside the store are removed and replaced by one new backup (`forgetCopies` in `plugin/files.mjs`). Removing every earlier copy costs the history of copies; rewriting each copy in place was the alternative and was not taken, because a missed copy is worse than a lost one and removal is the version that can be checked by reading bytes. An export in a folder the user chose is outside the plugin's reach and the panel says so. The host's own session log is also outside it: the conversation stays in DSH.
- *The store has a format number* (`STORE_FORMAT`, SQLite `user_version`). It is raised only when an older version would misread the store. Opening a newer store is refused untouched.
- *The name.* Nothing written by development builds under the earlier name is read. Compatibility with earlier stores starts at 0.9.0, the first version whose store carries a format number.

**Decided (0.8.0-alpha.12), from published work on agent memory.**

Taken:

- *Stored memory is a way in for text nobody vouched for.* Published attacks plant an instruction or a false fact in something an agent reads (a mail, a page), let memory store it, and wait for a later, unrelated request to recall it. The defences proposed score each memory's origin at write time and screen it at read time with another model. Here the same split is made without a model: `grounds` on each memory is "said" or "seen" by the roles of the records it cites (`grounds()` in `src/memory.mjs`), and three rules follow from it: what the user said is not changed on a record that is not the user's; a "seen" memory is used only in the open and is labelled; a "seen" memory never enters the always-present layer. What this does not stop: a model that cites a nearby user message as the ground for a claim that came from a tool. The quote must exist in that message, but code cannot tell whether it supports the claim. The eval scenario looks for exactly that.
- *Remember what cannot be observed again.* Reported from long agent runs: notes about state a tool can show again go stale and crowd out strategies, tested rules and traps. Added to the reflection prompt as a rule; not enforceable by code.
- *A wrong entry in the always-loaded layer reaches every session.* Already the reason the core is small and user-only; now also the reason for the habit rule above.

Looked at and not taken:

- *Graph of (subject, relation, object) triples with weights.* Recall here is by scene, and a triple store answers a different question (what is true of X) from the one this system asks (what mattered in situations like this one). A published system built that way reports that reinforcement which is not gated on the answer being right strengthens wrong paths; outcomes here are gated on what the user wrote next.
- *Validity intervals on every fact (when it became true, when it stopped).* A replaced memory already keeps the date it stopped holding and what replaced it. A separate "became true" date would have to be read out of prose by a model on every write, and nothing here queries by it yet.
- *Reading the whole store when it is small.* Reported: with few conversations, giving a model everything beats retrieval. The floor under recall exists so that a greeting calls nothing; removing it for small stores would trade that for recall that has not been shown to be missing here. Left until "missed" outcomes say otherwise.
- *Public benchmarks as the measure.* Audits of the common ones report wrong answer keys, lenient judges and corpora that fit in a context window, so a score mostly measures context handling. `eval/` stays the measure: short scenarios with checks on what the core did, run on the user's own model.

**Decided (0.8.0-alpha.11), from the host's source.** The list of event kinds memory reads is `isRead` in `src/mind.mjs`; an event of any other kind advances the cursor and writes no row (`keepRecord`, and `skip` in `Log.ingest`). The cursor is its own table, so a session can be read on after rows were never written or were removed. How a turn ended (`turn/end` reason) is kept on the event and passed to outcome reading, to reflection and to the judge only when the turn did not simply finish. Marks are stored but not interpreted: their payloads were not in the sources at hand, and guessing a shape would be reading meaning into data by code. The developer report lists the field names and types that arrive so the next version can read them. The agent preset of a session is recorded on what the user said and on what is learned from it; there is no preset wall yet because no store has shown more than one preset in use. Not handled: a change of working directory inside one session (`working-directory/change`) does not move later memories to the other project.

**Decided (0.8.0-alpha.9).** What the user and the assistant said is stored whole and never shortened. Everything else (tool calls and tool output) is stored up to 2,000 characters from the moment it is recorded (`capRecord` in `plugin/calls.mjs`). The reasons: memory reads at most 600 characters of a tool result when it reflects and 1,200 when it rereads, so nothing past that can ever be quoted as the ground of a memory; the host keeps the original conversation; and on a real store tool output was half of everything kept. Because the limit applies when the record is written, the record itself is still append-only. "Free up space" applies the same limit to stores written before it existed, skips anything a memory rests on, and runs only when asked. The table row above for tool output now reads: stored to 2,000 characters; older stores are shortened on request.
