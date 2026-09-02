MATCH REPLAY v15

■ 棋譜一覧更新を GitHub Pages / ローカル両対応に変更

ローカル:
- control.html は /api/matches を優先して参照
- server.js が /matches/ 内の .xg / .json を一覧化

GitHub Pages:
- GitHub Actions がデプロイ時に /matches/ を走査
- /matches/manifest.json を自動生成
- control.html は manifest.json を読み込んで棋譜一覧を表示

■ 運用
1. GitHub の matches/ フォルダへ .xg をアップロード
2. main に反映
3. GitHub Actions が自動実行
4. Pages デプロイ時に manifest.json が自動生成
5. control.html の「棋譜一覧更新」で表示

manifest.json を手作業で更新する必要はありません。

■ 差分ファイル
- control.js
- .github/workflows/pages.yml
- matches/manifest.json
- README.txt
