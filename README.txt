MATCH REPLAY v30

■ 変更内容
- design-presets.json を追加し、配色をプリセット管理
- 操作画面に「ボードデザイン」選択を追加
- プリセット選択で以下を一括切替
  - 選手1 / 選手2のチェッカー色
  - 選手1 / 選手2の勝率バー色
  - ボード面、ポイント2色、バー、罫線色
- 選択中プリセットの簡易カラープレビューを表示
- GitHub Pages / ローカルのどちらでも同じJSONを参照
- 同一棋譜を再反映する際の操作画面内の参照ミスも修正

プリセット追加は design-presets.json の presets 配列へ追加してください。


MATCH REPLAY v32
- 「表示へ反映」のPages同期を強化
- BroadcastChannelに加えて localStorage revision を300ms監視
- 同じ棋譜を再反映した場合も配信画面側で強制再読込
- ローカル時は従来どおり /api/meta + WebSocket で同期
