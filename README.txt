MATCH REPLAY v18

■ 修正
- 「表示へ反映」後も 1 / 6 のままになる問題を修正
- ローカルでは同じ棋譜を再選択しても必ず再解析
- ローカル解析に失敗した場合は「反映済み」にせず反映エラーを返す
- GitHub Pagesでは選択棋譜の generated JSON を読み、実ステップ数を操作画面へ反映
- GitHub Pagesの再生/停止/前へ/次へ/シーク/速度変更を表示画面と双方向同期
- 操作画面の初期 totalSteps を仮の6から1へ変更

■ 広告
- 広告エリアを横2枚表示へ変更
- 1920x1080の16:9画像を2枚同時に縮小表示
- 30秒ごとに次の2枚へ切り替え

■ 差分ファイル
- index.html
- styles.css
- app.js
- control.js
- server.js
- README.txt
