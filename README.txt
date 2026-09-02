BACKGAMMON AUTO REPLAY - PROTOTYPE

■ 内容
- 1920×1080固定の配信用HTML画面
- 白ベースの配信レイアウト
- Position Drill現行テーマ色（#B7924B）を反映した盤面
- プレイヤー名／スコア／キューブ／出目／手順一覧
- 前へ／再生・停止／次へ／シークバー／再生速度
- 添付いただいたXG棋譜を assets/ に同梱

■ 棋譜
assets/20250830_柳暢祐-平林直_第31期名人戦準々決勝.xg

XGファイルはExtreme Gammon独自のバイナリ形式です。
今回の叩き台では、XGファイルを正式な元棋譜として同梱し、
UI・盤面遷移・自動再生の構造を先に実装しています。

現状の6手分の盤面遷移はUI確認用の仮データです。
次段階では、XGからエクスポートした .mat / .sgf / テキスト棋譜、
またはXGバイナリの解析処理を接続して全手順を自動生成します。

■ 起動
index.html をブラウザで開いてください。
OBS等では1920×1080のブラウザソースとして利用できます。


■ GitHub Pages / GitHub Actions
この版は GitHub Pages の「Build and deployment → Source: GitHub Actions」に対応しています。

設定:
1. ZIPの中身をリポジトリ直下へ配置
2. main ブランチへ push
3. GitHub → Settings → Pages
4. Build and deployment → Source を「GitHub Actions」に設定
5. .github/workflows/pages.yml が自動実行されます

手動実行:
Actions → Deploy GitHub Pages → Run workflow

Workflow:
- actions/checkout@v6
- actions/configure-pages@v5
- actions/upload-pages-artifact@v4
- actions/deploy-pages@v4
