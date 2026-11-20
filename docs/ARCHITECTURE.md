# 基準文書と実装の対応

基準は [DESIGN.md](DESIGN.md) の原文のみ。0.7.0-alpha.1 は独立コアの場面照合と結果の戻りを整えた。測定は [VALIDATION.md](VALIDATION.md)。

| 基準の段階 | 実装 | 主モデルへの入り方 |
| --- | --- | --- |
| 原記録 | src/log.mjs: ingest / receive | 自動では渡さない |
| 場面読み | src/core.mjs: prepare → scenePrompt | 候補集めへだけ渡す |
| 候補集め | candidates: 効く場面の意味、人・物、日時の和集合 | 主モデルへは渡さない |
| 厳選 | prepare → selectPrompt | silent / mention / check のみ。not-now・未選択は渡さない |
| 応答と判断の跡 | plugin/index.mjs の context と asteme_note | 選択本文と常設の核。必要なら asteme_search |
| 明示的な即時反映 | apply(immediate): 名前・口調・決め事・明示約束。選別時の明示訂正は doubt | 次の返答まで待たせない |
| 独立した振り返り | reflect → reflectionPrompt → apply | 原文、関連理解、配達・使用申告・後の結果から更新 |
| 結果から注意へ戻す | assess → candidates → selectPrompt | 実配達と原記録で裏づけた場面・結果を使う。採点だけで主モデルへ直接注入しない |
| 定着（習慣） | consolidate → habitPrompt → promote / demote | コードが確かめた反復だけを、核の常設文として毎回渡す。根拠・理由・未検証の範囲を残す |
| 深い振り返り | 未実装 | 基準どおり初期範囲外 |

## 状態

- 記録：原発言・ツール結果、時刻、固定ID。attentionには候補、判断、配達本文、判断の前提、振り返り結果を追記する。
- 理解：text / reason / evidence / learnedAt / lastCheckedAt / certainty / concrete / general / tested / hypothesis。
- 懸案：理解と同じ根拠に加え trigger と closure。終わり方のない作成は拒否する。明示された期限切れはコードで閉じ、達成・取下げは根拠を読んだ振り返りで閉じる。
- 核：明示プロフィールを維持する。経験からの昇格は、コードが確かめた反復だけを習慣として1件ずつ行う。自動の目的・価値観変更は行わない。名前・話し方・決め事は経験から変えない。モデルによる変更と手動編集、習慣の昇格・降格に履歴を残す。

理解の旧版はexperience_historyに残す。現在形だけをexperienceに置く。数値ベクトルは再作成可能な索引であり、理解の本体ではない。
experience_feedbackは場面ごとの現在の評定を置き、元の評定・訂正理由はattentionに残す。回数を増やす成功点数ではない。名前・話し方・決め事はこれによって昇格させない。習慣の昇格条件はコードが持ち、モデルには文面だけを作らせる。習慣の来歴はexperience_historyの核行とhabits:\<owner\>に残し、降格しても消さない。

## 接続境界

src/core.mjs はDSHを知らない。infer(purpose,prompt,maxTokens)、embed(texts,kind)、Log、identity を受ける。保存と選別の循環を保ったまま、別のHarness/Botからも呼べる。

plugin/host.mjs はDSHの原イベント・モデル接続・実行時期・contextへの配達を担当する。plugin/index.mjsは公式フックと補助ツール、plugin/settings.mjsとclientは画面。DS-Botや別の入口は外側の接続先であり、今回別のBot本体は作らない。

## 初期範囲の限界

効いたかの判定はモデルの評定であり、因果効果の証明ではない。重要な判断の前提は主モデルがツールで申告した場合に残る。未申告を「使わなかった」と断定しない。原文と配達の跡から独立に振り返る。

長期間の定着・迎合抑制・別モデル間の同一性は未検証。定着のコード経路はあり、実セッションでの確認は[VALIDATION.md](VALIDATION.md)に記す。期限のない懸案の定期的な横断点検も、深い振り返りとともに残る。設計書の全章を実装済みとは扱わない。


