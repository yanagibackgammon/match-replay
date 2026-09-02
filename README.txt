MATCH REPLAY v17

■ 修正内容
- 「表示へ反映」をWebSocketだけに依存しない方式へ変更
- ローカルでは POST /api/meta で確実に設定を反映
- サーバー反映後、配信画面へWebSocketで即時同期
- ボタン表示を「反映中…」「反映済み」「反映エラー」に変更
- 棋譜選択時の自動反映を廃止し、「表示へ反映」ボタン押下時に反映する方式へ統一
- GitHub Pagesでは従来どおり localStorage + BroadcastChannel で反映

■ 注意
server.js を更新しているため、差分適用後は start-match-replay.bat を一度終了して再起動してください。
