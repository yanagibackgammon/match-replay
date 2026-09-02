MATCH REPLAY v08

OBS表示と操作画面を分離しました。

■ OBS表示
http://localhost:3000/

index.html は表示専用です。
再生ボタン・停止ボタン・シークバー・速度変更などの操作UIは表示されません。

■ 操作画面
http://localhost:3000/control.html

操作:
- 前へ
- 再生
- 停止
- 次へ
- シーク
- 0.5x / 1x / 2x

■ 同期
server.js のローカルWebSocketで同期します。
外部WebSocketサービスやアカウントは不要です。

■ Windowsでの起動
初回のみNode.jsをインストールしてください。
その後 start-match-replay.bat をダブルクリックします。

初回起動時は npm install を自動実行します。

■ OBS
Browser Source:
URL: http://localhost:3000/
Width: 1920
Height: 1080

■ 注意
GitHub PagesではWebSocketサーバーは動作しません。
配信時の同期操作はローカルサーバー版を使用します。
