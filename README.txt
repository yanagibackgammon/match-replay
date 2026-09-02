MATCH REPLAY v19

■ 修正内容
- GitHub Pages デプロイ時に ads/manifest.json を自動生成
- ads/ 内の PNG / JPG / JPEG / WEBP / GIF を自動検出
- 広告画像を追加・削除しても manifest.json の手動更新不要
- matches/manifest.json の generated マッピングも生成済みJSONから補完

■ 原因
広告画像自体はPages artifactへ正常にアップロードされていましたが、
ads/manifest.json が files: [] のままだったため、配信画面が広告なしと判断していました。
