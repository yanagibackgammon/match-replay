MATCH REPLAY v16

■ 実XG棋譜対応
- app.js 内の仮6局面を廃止
- matches/*.xg を実際に解析して再生データへ変換
- プレイヤー1/2、25pt等のマッチ情報
- 各ゲームのスコア
- 盤面（バー上のチェッカーを含む）
- 出目
- 実際のムーブ
- 候補手
- 候補手の評価差
- エラー値
- キューブアクション
- 勝率
をXGから取得します。

■ GitHub Pages
GitHub Actionsで
  matches/*.xg
    ↓
  scripts/xg-parser.cjs
    ↓
  matches/generated/<棋譜名>.xg.json
へ自動変換してからPagesへデプロイします。

GitHubへ.xgをアップロードするだけでよく、生成JSONをコミットする必要はありません。

■ ローカル
server.js が選択された .xg をその場で解析します。
操作画面で棋譜を選択して「表示へ反映」を押すと、OBS側の配信画面が実棋譜へ切り替わります。

■ GitHub Pages上の操作画面
棋譜選択・大会名・対戦者名はlocalStorage / BroadcastChannelで同一ブラウザ内の配信画面へ反映します。
OBS配信運用は従来どおり localhost:3000 を推奨します。

■ Joker / Anti-Joker
XGに保存されているロール前評価と、次の実出目後の勝率を比較し、勝率が10ポイント以上動く実出目だけを表示します。
XGファイル単体には「全21通りの将来出目の勝率一覧」は保存されないため、現在は実際に出た出目を対象に判定します。

XGバイナリ仕様:
https://www.extremegammon.com/xgformat.aspx
