# web

このリポジトリは、`deciscope` のWebアプリケーションです。

## Firebase Microsoftログイン

`.env.example` を参考に `.env.local` を作成してください。

```env
API_PROXY_TARGET=http://127.0.0.1:9090
WS_PROXY_TARGET=ws://127.0.0.1:9090
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=deciscope-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=deciscope-app
VITE_FIREBASE_APP_ID=...
```

開発時、ブラウザは同一オリジンの `/api` と `/ws` に接続し、Vite が上記のプロキシ先へ転送します。
本番環境でブラウザから別オリジンの API に直接接続する場合のみ、`VITE_API_BASE_URL` と
`VITE_WS_BASE_URL` を設定してください。

Firebase Console の Authentication で Microsoft プロバイダーを有効化し、承認済みドメインに `localhost` が含まれていることを確認してください。

## ビルド

ビルド手順は [BUILD.md](./BUILD.md) を参照してください。
