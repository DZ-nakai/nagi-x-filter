# 凪 (Nagi) — nagi-x-filter

> ブロック / ミュートしたアカウントを **X（旧 Twitter）の検索結果から消して**、タイムラインを *凪* に。

![license](https://img.shields.io/badge/license-MIT-blue) ![platform](https://img.shields.io/badge/platform-PC%20%7C%20iOS%20%7C%20Android-green) ![type](https://img.shields.io/badge/type-userscript-orange)

**凪（なぎ）** とは、波風がおさまって水面が穏やかになった状態のこと。
X の検索（特に「最新 / Latest」タブ）では、自分がブロック / ミュートしたはずのアカウントの投稿が、
ハッシュタグ検索などで表示されてしまうことがあります。`nagi-x-filter` は、それらの「ノイズ」を
検索結果から静かに取り除き、フィードを **凪** のように穏やかに保つユーザースクリプトです。

> [!IMPORTANT]
> これは **非公式（unofficial）** の個人プロジェクトです。X Corp. とは一切関係ありません。
> 「X」「Twitter」は各権利者の商標です。本ツールは公式 API を使用せず、
> あなたのブラウザに表示されている内容をクライアント側で整理するだけです。

## なぜ作ったか

X には標準で「ブロックとミュートのアカウントを除外（Remove blocked and muted accounts）」という
検索設定があります。しかしこれは挙動が不安定で、特に「最新」タブや一部の画面では
**取りこぼし**が起きます。本ツールはその穴を、クライアント側の DOM フィルタで補修します。

## 特徴

- 🌊 **検索結果から自動で非表示** — ブロック / ミュート済みアカウントの投稿を消す
- 🔒 **プライバシーファースト** — 公式 API を叩かない。データは端末内に閉じ、外部送信なし
- 📱 **1 本でマルチプラットフォーム** — 同じユーザースクリプトで PC / iOS / Android に対応
  | 環境 | 実行手段 |
  |---|---|
  | PC | Tampermonkey |
  | iOS | Safari + [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) |
  | Android | Firefox + Violentmonkey / Tampermonkey |

## 仕組み（概要）

1. ブロック / ミュート一覧ページ（`/settings/blocked/all` 等）を開いたとき、
   レンダリング済み DOM から対象アカウントの handle を収集して端末内に保存する（API 非依存）。
2. 検索結果ページで `MutationObserver` が投稿を監視し、収集した handle に一致する投稿を非表示にする。

詳しい設計判断は [`docs/design.md`](docs/design.md) を参照。

## インストール

> 🚧 MVP 実装中。インストール手順は実装完了後に記載します。

## ロードマップ

- [ ] 検索結果での DOM フィルタ（MVP）
- [ ] 設定ページからのブロック / ミュート一覧の自動収集
- [ ] モバイル版 X の DOM セレクタ対応
- [ ] 手動の非表示リスト編集 UI
- [ ] ホーム TL への適用（任意）

## 開発

```
src/
  nagi-x-filter.user.js   # ユーザースクリプト本体
docs/
  design.md               # 設計判断メモ（なぜこの構成にしたか）
```

## ライセンス

[MIT](LICENSE)
