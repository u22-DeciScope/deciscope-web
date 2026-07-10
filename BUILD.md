# Build

## 前提

- Node.js と npm がインストール済みであること
- プロジェクトルート: `deciscope-web`

## 開発

```bash
npm install
npm run dev
```

開発サーバーは `http://localhost:5193` で起動します。

## ビルド手順

```bash
npm run build
```

ビルド成果物は `build/` 配下に出力されます。

## 本番コンテナ

`Dockerfile.runtime` は、事前に生成した `build/` を本番イメージへ格納します。

```bash
npm ci
npm run build
docker build -f Dockerfile.runtime -t deciscope-web:test .
docker run --rm -p 3000:3000 deciscope-web:test
```

## ローカル確認（任意）

```bash
npm run start
```

必要に応じて本番相当の起動確認を行ってください。
