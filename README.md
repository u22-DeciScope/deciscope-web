# web

このリポジトリは、`deciscope` のWebアプリケーションです。

## 構成

- フロントエンドFW: React Router 7 + Vite + React
- ルーティング: `app/routes.ts`
- 開発起動: `npm run dev`
- ビルド: `npm run build`
- 開発サーバー: `http://localhost:5193`

## Firebase Microsoftログイン

`.env.example` を参考に `.env.local` を作成してください。

```env
API_PROXY_TARGET=http://127.0.0.1:9090
WS_PROXY_TARGET=ws://127.0.0.1:9090
VITE_DECISCOPE_WS_URL=ws://localhost:5193/api/v1/ws/transcript-segments
VITE_DECISCOPE_API_BASE_URL=http://localhost:5193
VITE_DECISCOPE_WS_CLIENT_TOKEN=dev-ws-token
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=deciscope-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=deciscope-app
VITE_FIREBASE_APP_ID=...
```

開発時、ブラウザは同一オリジンの `/api` と `/ws` に接続し、Vite が上記のプロキシ先へ転送します。
本番環境でブラウザから別オリジンの API に直接接続する場合のみ、`VITE_API_BASE_URL` と
`VITE_WS_BASE_URL` を設定してください。

Firebase Console の Authentication で Microsoft プロバイダーを有効化し、承認済みドメインに `localhost` が含まれていることを確認してください。

## 文字起こしWebSocketテスト

`/test` に、Go API の文字起こし WebSocket を確認するための独立したテストページがあります。

```bash
npm run dev
```

確認URL:

```text
http://localhost:5193/test
```

テストページは `VITE_DECISCOPE_WS_URL` を接続先として使います。未設定の場合は、ブラウザ同一オリジンの次のURLへ接続します。

```text
ws://localhost:5193/api/v1/ws/transcript-segments
```

`callId` を入力すると、WebSocket URLに `?callId=<callId>` を付与します。`VITE_DECISCOPE_WS_CLIENT_TOKEN` が設定されている場合は `token` も付与しますが、画面表示ではマスクされます。`DECISCOPE_INGEST_API_KEY` などのバックエンド秘密値はフロントエンド環境変数に入れないでください。

Connect時に履歴取得APIも確認します。

```text
GET /api/v1/transcript-segments?callId=<callId>&limit=100&token=<client-token>
```

履歴APIが未実装の場合、画面にその旨を表示し、WebSocket受信は継続します。履歴とWebSocketで同じデータが届いた場合は、`eventId` または `callId + sequenceNo` で重複排除します。

## APIプロキシ

開発時の推奨構成は、ブラウザからフロントエンドと同一オリジンへ接続し、Vite が Go API へプロキシする方式です。ブラウザ上のJavaScriptから `ws://api:9090/...` へ直接接続しないでください。`api` はDocker Compose内部のサービス名であり、ホストPC上のブラウザからは通常解決できません。

テストページ用に、Vite は次のパスを Go API へ転送します。

```text
/api/v1/transcript-segments
/api/v1/ws/transcript-segments
```

Docker Compose内では、proxy先は既定で次になります。

```text
http://host.docker.internal:9090
```

Go APIとfrontendを同じDocker networkに入れて `api:9090` で解決できる場合だけ、`API_PROXY_TARGET=http://api:9090` と `WS_PROXY_TARGET=ws://api:9090` に上書きしてください。

ローカルでGo APIをホスト公開ポートから使う場合は、`.env.local` で次を使います。

```env
API_PROXY_TARGET=http://127.0.0.1:9090
WS_PROXY_TARGET=ws://127.0.0.1:9090
```

Go API側で `DECISCOPE_WS_CLIENT_TOKEN` を設定している場合は、frontend側の `VITE_DECISCOPE_WS_CLIENT_TOKEN` または compose 用の `DECISCOPE_WS_CLIENT_TOKEN` に同じ値を設定してください。Go API側の `DECISCOPE_WS_ALLOWED_ORIGINS` には `http://localhost:5193` と `http://127.0.0.1:5193` も含めます。

## Docker開発起動

フロントエンド単体の開発コンテナを起動できます。

`.env.local` に `VITE_DECISCOPE_WS_CLIENT_TOKEN` を設定している場合、composeはその値をfrontendコンテナへ渡します。Go API側の `DECISCOPE_WS_CLIENT_TOKEN` と同じ値にしてください。

```bash
docker compose up --build frontend
```

確認URL:

```text
http://localhost:5193/test
```

このcomposeは、Go APIがホスト公開ポート `localhost:9090` で動いている前提で、frontendコンテナから `host.docker.internal:9090` へproxyします。

Go APIコンテナが同じDocker network上で `api:9090` として解決できる場合は、次のようにproxy先を上書きしてください。

```bash
API_PROXY_TARGET=http://api:9090 WS_PROXY_TARGET=ws://api:9090 docker compose up --build frontend
```

Go APIが別リポジトリのComposeで動き、`api` サービス名で接続したい場合は、両方のComposeを同じネットワークへ参加させてください。

```bash
docker network create deciscope
```

Go API側Composeにも同じ外部ネットワークを追加し、APIサービスに `api` エイリアスを付けます。このリポジトリ側は既定で `deciscope` ネットワークを使います。別名を使う場合は `DECISCOPE_DOCKER_NETWORK` を設定してください。

Go APIをDockerではなくホスト上の `localhost:9090` で起動している場合も、既定設定のままで `host.docker.internal:9090` へ接続します。明示する場合は次のように指定できます。

```bash
API_PROXY_TARGET=http://host.docker.internal:9090 WS_PROXY_TARGET=ws://host.docker.internal:9090 docker compose up --build frontend
```

## VM Bot / 手動POST確認

1. Go APIを起動します。
2. フロントエンドを `npm run dev` または `docker compose up --build frontend` で起動します。
3. `http://localhost:5193/test` を開きます。
4. 必要なら `callId` を入力して Connect します。
5. VM Bot、またはバックエンド手順に沿った手動POSTで `POST /api/v1/transcript-segments` へ文字起こしを投入します。
6. `/test` の接続状態が `connected` になり、最新の文字起こしと一覧に受信データが表示されることを確認します。

`/test` は既存の公開ページやworkspace配下のルートとは分離しており、確認用UIとして追加されています。

## ビルド

ビルド手順は [BUILD.md](./BUILD.md) を参照してください。
