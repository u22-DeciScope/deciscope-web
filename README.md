# deciscope-frontend

このリポジトリは、`deciscope` のフロントエンドアプリケーションです。

## Firebase Googleログイン

`.env.example` を参考に `.env.local` を作成してください。

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_BASE_URL=ws://localhost:8080
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=deciscope-2733c.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=deciscope-2733c
VITE_FIREBASE_APP_ID=...
```

Firebase Console の Authentication で Google プロバイダーを有効化し、承認済みドメインに `localhost` が含まれていることを確認してください。


## ビルド

ビルド手順は [BUILD.md](./BUILD.md) を参照してください。
