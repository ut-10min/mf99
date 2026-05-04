# mf99 website draft

GitHub Pages で `mf99/` 配下に置く想定の最小構成です。

主に毎回編集するファイル:
- data/config.json: 外部リンク、日付、会場、SNS、動画、地図
- data/talks.json: 講演内容
- data/schedule.json: タイムテーブル

画像は img/ に置いてください:
- title.png
- title_background.png
- X.png
- facebook.png
- instagram.png
- youtube.png
- favicon.ico


## data/config.json の整理方針

`config.json` には、HTML内に直接書くと重複・更新漏れが起きやすい情報だけを置いています。

- 開催日時
- 会場名・住所
- 外部リンク
- SNSリンク
- 運営統括・運営メンバー

イベント説明文、参加方法の本文、問い合わせ説明文など、HTML上で読めた方が保守しやすい文章は `index.html` に残しています。


## HTML内の仮表示とconfigの関係

`data-config` / `data-link` / `data-sns` が付いた場所は、ページ読み込み後に `data/config.json` の値で上書きされます。

HTML内には実データを重複して書かず、以下のような仮表示だけを置いています。

- 日時: `XXXX年X月XX日 XX:XX–XX:XX`
- 会場: `会場未定`
- URL: `href="#"`

JavaScriptが正常に動くと、configの値が優先されます。JavaScriptが動かない場合は、HTML内の仮表示がそのまま表示されます。

## Node.js による静的ビルド

通常の開発では、これまで通りルート直下の `index.html`, `talks.html`, `timetable.html` をそのまま使えます。Node.js を使える環境では、以下で `dist/` に静的HTMLを生成できます。

```bash
npm run build
```

静的ビルドでは、`data/config.json`, `data/talks.json`, `data/schedule.json` の内容をHTMLへ事前反映します。YouTube と Google Map の iframe 生成だけは `dist/js/embed-runtime.js` に残します。

## Node.js のバージョン固定

長期保守のため、Node.js は LTS 系の `22.x` に固定しています。

- `.nvmrc`: `22`
- `.node-version`: `22`
- `package.json` の `engines.node`: `22.x`
- GitHub Actions の `setup-node`: `22.x`
- npm: `10.9.0`

ビルドスクリプトは Node.js の標準ライブラリだけを使い、外部 npm パッケージに依存しません。
