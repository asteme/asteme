# Asteme 作業引継ぎ

> Not kept up since 0.11.0-alpha.4. From then on the instructions for each version are in the message that comes with it, and what changed is in `CHANGELOG.md`. Where this file and those disagree, they are right.

最終更新: 2026-11-19 / 対象: Asteme 0.11.0-alpha.4

## 1. これは何か

Asteme は、AI エージェントのための長期記憶。会話を「その時の状況」と一緒に覚え、似た状況が来たら思い出し、使った結果で思い出しやすさを変える。保存は 1 つの SQLite ファイルで、ローカルに置く。

- GitHub: `asteme/asteme`（private、本体）
- DSH プラグイン配布: `asteme/dsh-asteme`（private、このリポジトリから生成するバンドル。手で編集しない）
- npm: `asteme` / `dsh-asteme`（名前確保のみ）
- ライセンス: Apache-2.0 + NOTICE（0.11.0 から。名前とマークは対象外、TRADEMARKS.md）
- 表示名: ASTEME（ロゴ・見出し）、文中は Asteme
- 公開: 保留。実機でしばらく使ってから決める

## 2. 役割分担

- **設計と判断**: 設計担当（Claude）とオーナー。記憶の挙動、プロンプト、しきい値、画面の文言、保存するもの・消すもの、公開の可否。
- **ローカルの Agent**: 道具。指示された作業を実行し、結果をそのまま報告する。判断はしない（第 8 節）。

## 3. 開発の原則

GitHub が正本。

1. 作業を始める前に `git pull --ff-only origin main`
2. 変更はブランチで作業する（例: `work/0.9.6`）
3. 変更したら push する。ローカルだけの変更を残さない
4. main は force push しない。履歴を書き換えない

## 4. セットアップ

必要なもの: Node.js 22.5 以上、DeepSeek Harness デスクトップ。

```powershell
git clone https://github.com/asteme/asteme.git
cd asteme
npm test          # 依存なしで動く
npm run bundle    # dist-dsh/ ができる（ビルド済みパネルはコミット済み）
```

DSH への入れ方は 2 通り。

- GitHub から: DSH の「プラグインを追加」に `https://github.com/asteme/dsh-asteme.git`
- ローカルから: 「プラグインを追加」でローカルディレクトリを選び、`dist-dsh` の絶対パス

本体 `asteme/asteme` は DSH プラグインとして宣言していないので、本体の URL では入らない。

パネル（`client/`）を変更したときだけ:

```powershell
npm install       # esbuild と React
npm run build     # client/dist/client.js を作り直す。これもコミットする
```

本体を変更したら `npm run sync-dsh` でバンドル用リポジトリへ反映する。手でコピーしない。

## 5. 日常のコマンド

```powershell
npm test            # テスト
npm run build       # パネルのビルド（要 npm install）
npm run preview     # client/preview/preview.html を作る（DSH なしで画面を見る）
npm run demo        # サンドボックスのデモ
npm run eval        # 評価（モデルが必要）
npm run bundle      # DSH プラグイン用の dist-dsh を作る
npm run sync-dsh    # dist-dsh を asteme/dsh-asteme に push する
```

## 6. 構成

- `src/` コア。`core.mjs` に各モジュールのメソッドを合成
- `plugin/` DSH アダプタ
  - `host.mjs` セッション追跡、モデル呼び出し（DSH がないと読み込めない）
  - `events.mjs` DSH のイベントから何を保存するか（テストあり）
  - `calls.mjs` モデル呼び出しの方針（テストあり）
  - `files.mjs` エクスポート、バックアップ、忘却、リセット、ファイル選択
  - `settings.mjs` パネルとのやり取り
- `client/` パネル（React）。`client/dist/client.js` はビルド結果でコミット対象
- `test/` テスト、`eval/` 評価、`standalone/` DSH なしで使う MCP サーバー
- `docs/IMPLEMENTATION.md` 今の挙動と決定の記録。`DESIGN.md` は設計の全体像

## 7. 設定とデータ

- データ: `%USERPROFILE%\.dsh\profiles\<profile>\data\dsh-asteme\<hash>\memory.sqlite`
- Jev のキー: パネルで入れると store に保存される（表示・エクスポート・バックアップには出ない）
- バックアップ: 1 日 1 回、圧縮。自動は 7 個まで
- 忘れる: store の中身を上書きし、以前のコピーとエクスポートを消して作り直す
- 最初からやり直す: 設定以外をすべて消す。DSH にある過去の会話は読み直さない
- プロジェクト一覧: 記憶があるか、30 日以内に会話があったプロジェクトだけ出る。フォルダを消しても、そこで覚えた記憶がある間は残る

## 8. ローカルの Agent への指示

### してよいこと

指示された作業の実行、テストの実行、ビルド、バンドル、push、実機での動作確認、結果の報告。

### してはいけないこと

- 設計の判断。迷ったら作業を止めて、選択肢と分かっている事実を報告する
- プロンプト（`src/prompts.mjs`）、しきい値、画面の文言、保存・削除の規則の変更
- テストを通すためのテストの書き換え。落ちたら、テスト名とエラー全文を報告する
- データの削除、force push、npm への publish、リポジトリの公開
- 「たぶん動く」という報告。実行したことと、その出力だけを書く

### 0.9.6 でやる作業

1. `work/0.9.6` ブランチを作り、渡された ZIP の中身でリポジトリを置き換える（`.git` は残す）。ZIP に無くてリポジトリにあるファイルは**消さずに一覧を報告**する
2. `npm test`（135 件）と `node --test client/copy.test.mjs`（8 件）を実行し、件数を報告する。落ちたらテスト名とエラー全文
3. `npm run bundle` → DSH に入れ直す。DSH を完全に終了してから入れること（`onnxruntime-node` の DLL が掴まれていると pnpm の link が失敗する）。前回残った `node_modules/onnxruntime-node.locked` は、DSH 終了後に消してよい。消せなかったらそのまま報告する
4. **テスト用プロファイルで**次を 1 つずつ試し、起きたことをそのまま報告する
   - 設定 →「待ち時間とペース」に「1回あたりの裏の作業数」「次の回までの間隔」が出るか。初期値が 1 と 30 秒か
   - 「いま振り返る」を押して、開発者レポートの「Model calls」で呼び出しが間隔どおりに増えるか
   - 設定の言語を Deutsch / Español などに変えて、パネルとサイドバーの表示が変わるか
   - 「このモデルを確かめる」→「確認を実行」が最後まで走るか（0.9.5 は `eval/harness.mjs` が無くて失敗していた）。結果の件数と、落ちた項目名を報告する
   - 「すべて消す」の直前にメッセージを送っておき、消した 10 秒後に記憶が 0 件のままか（0.9.5 までは、消した直後に 1 件書き戻されることがあった）
   - 日本語で私的なこと（例: 持病と薬）を覚えさせ、(a) 関係ない依頼では出てこないか、(b) 直接たずねたら見える形で答えるか。記憶タブでその記憶に「プライベート」の印が付いているか
   - 作業を途中でやめる会話（「あとで戻る」）をして、記憶タブに「懸念」として 1 件だけ入るか。「まだ書いていない」のような状態が「理解」として入っていたら、その文面を報告する
   - Windows だけの確認: 「フォルダーを開く」「フォルダーを選ぶ…」「ファイルを選ぶ…」
5. 問題がなければ PR を作る。main への取り込みはオーナーが決める
6. 取り込み後に `npm run sync-dsh`。バンドル用リポジトリの一覧での順番（先頭か末尾か）に依存はない。パッチの適用順に依存するものも無い
7. 数日使ったあと、パネルから開発者レポートを保存して渡す。冒頭の「Worth a look」に何が出ているかが一番知りたい

### DSH を手元で立ててテストする方法（設計側が 0.9.6 で実際に使った手順）

Linux、Node 24。デスクトップ版でなく npm の `@deepseek-ai/dsh` を使う。

```bash
mkdir dsh-run && cd dsh-run && npm i node@24 @deepseek-ai/dsh@0.2.2-rc.1
export PATH=$PWD/node_modules/.bin:$PATH DSH_HOME=$PWD/home
# プロバイダーと既定モデルは home/profiles/web/cordis.patch.yml に書く。キーは環境変数で渡し、ファイルに書かない
(cd ../asteme && npm run bundle && cd dist-dsh && npm pack)      # tgz を作る
dsh plugin --profile web add ../asteme/dist-dsh/dsh-asteme-0.9.6.tgz   # link: では @deepseek-ai/* が解決できない
dsh web --no-open --port 8787                                    # 表示された URL をブラウザーで開く
```

ストアは `home/profiles/web/` の下の `memory.sqlite`。ヘッドレス実行（`dsh run`）は最後のイベントを同期する前に終了するので、記憶のテストには web を使う。

## 8.5 頭脳（0.10.0-alpha.1 から）

Asteme を「ユーザーが話す相手」にして、DSH などのエージェントを道具として使う形。設計は `docs/BRAIN.md`。DSH プラグインはそのまま残る。

動かし方（Windows の例）:

```powershell
npm install                       # 埋め込みモデルのライブラリ
# %USERPROFILE%\.asteme\brain.json を作る（中身は docs/BRAIN.md の「Running it」）。キーは書かない。keyEnv に環境変数名を書く
$env:DEEPSEEK_API_KEY = "..."
npm run brain                     # 表示された URL をブラウザーで開く
npm run brain:preview             # モデルなしで画面だけ見る
```

ローカルの Agent に頼みたい確認（**テスト用の設定で**。結果はそのまま報告）:

1. `npm test` が 131 件通るか（Windows で `test/brain.test.mjs` が落ちたら、テスト名とエラー全文）
2. `npm run brain` で画面が開くか。日本語で一言話して返事が来るか。かかった秒数
3. worker に `dsh acp` を設定して「作業フォルダーに hello.txt を作って」と頼み、ファイルができて報告が来るか。Windows で `dsh` が見つからない場合は、`command` に何を書けば起動できたかを報告する
4. 「2 分後に声をかけて」と頼んで、何も打たずに待ち、向こうから話しかけてくるか
5. 5 分放置して「眠っています」になるか。その間のモデル呼び出しが 0 件か（開発者レポートは頭脳側にまだ無いので、ストアの journal を見る）
6. worker が許可を求める作業（例: `git commit`）を頼んで、画面に許可の枠が出るか。断ったら作業が止まるか

### 0.10.0-alpha.2 で確認してほしいこと（Windows、テスト用の設定で）

1. `npm test` が 131 件すべて通るか（前回の EBUSY 2 件が消えたか）
2. DSH の Asteme パネル → 設定 →「Asteme 本人と話す」→「会話を開く」。Electron で新しいウィンドウが開くか。開かなければ、下に出るアドレスをブラウザーで開けるか。起きたことをそのまま報告
3. その画面で、DSH の会話で教えたことを尋ねて、同じ記憶から答えるか
4. 画面右上の「空：ふつう／静か／なし」が切り替わり、開き直しても残るか
5. DSH の普通の会話で何か教え、同じ会話の数通あとで関連する依頼をする。返信前の待ちが無い（または短い）か。開発者レポートの「Before the reply」の数字を前後で報告
6. 日記を保存して、空の見出しと「ツール実行」の行が無いか
7. worker の `command` に `dsh.cmd` のような .cmd を書いて起動できるか。`dsh acp` の API キーは、頭脳を起動する環境変数に `DEEPSEEK_API_KEY` を入れておけば worker に引き継がれる（設定ファイルには書かない）

### 0.10.0-alpha.3 で確認してほしいこと

1. **埋め込みモデルが読み込めない件**: 実機で `(0 , onnxruntime_common_1.registerBackend) is not a function` が出ている。プラグインの入れ直しで `onnxruntime-node` と `onnxruntime-common` の版がずれた可能性が高い（以前 `onnxruntime-node.locked` が残った件）。DSH を完全に終了 → プラグインのフォルダーの `node_modules` を消して入れ直す。入れ直し後、`node_modules` 内の `onnxruntime-node` と `onnxruntime-common` の `package.json` の version を報告する。直らなければエラー全文
2. サイドバーの ASTEME を押すと「話す」タブが開き、その場に会話が出るか（デスクトップ版の Electron で枠の中に表示されるか。真っ白ならコンソールのエラー全文）
3. 1 が直る前でも、会話で返事が来るか（記憶なしで答え、エラーで止まらないこと）

### 0.11.0-alpha.1 で確認してほしいこと（デスクトップ版、テスト用の設定で）

1. `npm test` が 135 件通るか
2. サイドバーの ASTEME を押すと、ヘッダーもタブもなしで会話が画面いっぱいに出るか（Electron で枠の中が表示されるか。真っ白ならコンソールのエラー全文）
3. 件数（「n 件覚えています」）を押す → 一覧と検索 → 1 件開く → 「いまは使わない」→「また使う」。名前を押す → 名前を変えて保存 → 入力欄の文言が変わるか。状態の言葉を押す → していたことが出るか
4. 星を 1 つ押して、その記憶が右に開くか
5. 下の「管理と設定」で、確認・記憶・活動・憲章のタブに行け、「話す」で戻れるか
6. テスト用の記憶を 1 件「忘れる…」で消し、記憶タブからも消えているか

### 0.11.0-alpha.2 で追加の確認

1. DSH で会話が画面の幅・高さいっぱいに出るか（前の版は中央の細い枠だった）。スクリーンショットを付ける
2. 名前を押す →「この人の画像」「あなたの画像」に画像を選ぶ → 会話の顔が変わるか
3. 会話で「今日はクールな感じで話して」と言い、次の返事の口調が変わるか。名前を押して「いまの話し方」に出るか。「いつもの話し方に戻す」で戻るか。憲章タブの口調が書き換わっていないこと
4. 頭脳を単体で: `node brain/cli.mjs --person test1 export test1.json` → `node brain/cli.mjs --person test2 import test1.json` → `--person test2` で起動して、名前と会話が入っているか

### 0.11.0-alpha.3 で追加の確認

1. 右上の「見た目」→ 画像を選ぶ → 背景に出るか。「暗くする」「ぼかす」が効くか。「あなたの色」で自分の吹き出しの色が変わるか。文字の大きさが変わるか
2. 名前を押す → 顔の画像を選んで反映されるか（前の版は選んでも何も起きなかった）
3. DSH にスキン（例: dsh-claude-style）を入れた状態で ASTEME を開き、会話の背景色と文字色が DSH と同じになるか。スクリーンショットを付ける
4. 「いまの話し方」を決めて「この話し方を残す」→ 一覧から選び直せるか

### 0.11.0-alpha.4 で追加の確認（デスクトップ版）

1. プラグインが読み込まれるか（`inject` の書き方を変えた。読み込まれなければエラー全文）
2. ASTEME の会話で「作業フォルダーに test-from-asteme.txt を作って」と頼む → DSH のセッション一覧に新しいセッションが出るか → ファイルができて会話に報告が来るか
3. 許可が要る作業（例: コマンド実行）を頼み、会話の行が「DSH のそのセッションで、あなたの許可を待っています」になるか。DSH 側でそのセッションを開いて許可 → 会話に結果が戻るか。**ここは設計側で未確認**
4. 会話画面右上の「記憶 n」「見た目」「管理と設定」がそれぞれ開くか。「管理と設定」で名前を変えて「話す」に戻ると、会話側にも反映されているか

## 9. いま残っている問題

1. Windows で確かめていないもの: 上の 4 の Windows の項目
2. Windows の `EBUSY` テスト 1 件（原因未確認）
3. 返信前の読みが遅い。小さいモデルでも 1 回 5〜14 秒、場面だけが呼んだ候補があるともう 1 回。判定モデルを「判定」にすれば返信は待たなくなるが、一致率を 30 件以上で確かめてから
4. `feedback/*`（👍/👎）と `approval/decided` は、実機でまだ 1 件も受け取っていない
5. 長く使わないと確かめられないもの: 習慣への昇格、複数の事例からの教訓、結果による忘却
6. 公開のタイミング

## 10. 注意

- コードとコメントは英語。他の言語は `client/locales/`、`src/diary.locales.mjs`、各言語の README、この文書だけ
- 会話ログ、DB、個人情報、API キーをリポジトリに入れない
- npm の publish はセキュリティキー（WebAuthn）
- 組織 `asteme` のメンバー: `WSL043`（Owner）、`SR043`（Member）
