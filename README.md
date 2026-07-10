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
VITE_API_BASE_URL=/api
VITE_WS_BASE_URL=/ws
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=deciscope-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=deciscope-app
VITE_FIREBASE_APP_ID=...
# 任意
VITE_FIREBASE_STORAGE_BUCKET=deciscope-app.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
# 任意。trueにすると会議開始まわりのdebugログを出力します
VITE_DECISCOPE_DEBUG_MEETING_START=true
```

開発時、ブラウザは同一オリジンの `/api` と `/ws` に接続し、Vite が上記のプロキシ先へ転送します。
会議画面のworkspace-scoped APIは `VITE_API_BASE_URL`、文字起こしWebSocketは
`VITE_WS_BASE_URL` を使います。本番環境でブラウザから別オリジンの API に直接接続する場合のみ、
この2つを公開ホストに合わせて設定してください。

Firebase Console の Authentication で Microsoft プロバイダーを有効化し、承認済みドメインに `localhost` が含まれていることを確認してください。

## 会議URLからBot参加

workspace配下の「Teams 会議に入室」画面でTeams会議URLを貼って `会議に入室` を押すと、フロントエンドは認証済みのworkspace APIへ次のリクエストを送ります。

```text
POST /v1/workspaces/{workspaceId}/meeting-sessions
```

```json
{
  "joinUrl": "https://teams.microsoft.com/l/meetup-join/...",
  "userProvidedTitle": "週次定例"
}
```

レスポンスの `sessionId` を受け取ったら、フロントエンドは `sessionId` をパスに含めて会議画面へ遷移します。

```text
/w/<workspaceId>/meetings/<sessionId>
```

会議URL送信時の流れは、workspace-scoped APIでのsession作成、pending navigationの保存、`sessionId` パスへの遷移の順です。`sessionId` をルートパラメータに持たせることで、認証状態の再確認、ページ再読み込み、React stateの破棄を挟んでも会議セッションを復元できます。送信中はボタンをdisabledにし、同じsubmitの二重実行を防ぎます。

ホームの進行中一覧では、Go APIの `GET /v1/workspaces/{workspaceId}/meeting-sessions` と `GET /v1/workspaces/{workspaceId}/meeting-sessions/{sessionId}` のstatusを使ってTeams会議を表示します。`ended`、`failed`、`stale`、`timeout` のTeams sessionは進行中一覧から外れ、最近の会議側に表示されます。Teams会議の「開く」「記録を見る」は `sessionId` を含む会議画面パスへ遷移するため、既存meetingレコードだけを開いて空の会議画面になることを避けます。

`sessionId` はURLパスを正とします。`localStorage` の `deciscope:meetingSessions:v1` は、作成直後の復帰や旧導線の補助情報としてのみ使います。旧実装の `deciscope:lastSessionId` は最後に作成したsessionの控えとしてのみ更新し、ホーム一覧へは自動移行しません。

認証状態が `loading` の間は未認証扱いでredirectせず、「認証状態を確認しています...」を表示します。WebSocketの一時切断や再接続中も会議画面は維持し、画面内の接続状態として表示します。

開発時は `VITE_DECISCOPE_DEBUG_MEETING_START=true`、またはVite dev modeで、次のdebugログを確認できます。joinUrl全文は出力しません。

```text
[meeting-start] session created
[meeting-start] navigating to meeting page
[auth-guard] state
[meeting-page] mounted or route changed
[meeting-page] WebSocket connected
```

フロントエンドが直接VM Botを叩くことはありません。正しい流れは `Frontend -> Go API -> VM Bot` です。`DECISCOPE_BOT_CONTROL_URL`、`DECISCOPE_BOT_CONTROL_TOKEN`、`DECISCOPE_INGEST_API_KEY` はフロントエンド環境変数に設定しないでください。

## APIプロキシ

開発時の推奨構成は、ブラウザからフロントエンドと同一オリジンへ接続し、Vite が Go API へプロキシする方式です。ブラウザ上のJavaScriptから `ws://api:9090/...` へ直接接続しないでください。`api` はDocker Compose内部のサービス名であり、ホストPC上のブラウザからは通常解決できません。

Vite はworkspace-scoped APIとWebSocketを Go API へ転送します。

```text
/api/v1/meeting-sessions
/v1/workspaces/.../meeting-sessions
/v1/workspaces/.../meeting-sessions/.../transcript-stream
/ws/v1/workspaces/.../meeting-sessions/.../transcript-stream
```

`/api/v1/meeting-sessions` はVM Bot連携や手動確認に残しているAPI-key系の互換ルートです。通常のブラウザUIは `/v1/workspaces/.../meeting-sessions` を使います。

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

workspace-scoped WebSocketはセッションCookieとworkspace所属検査で認証されます。共有トークンをフロントエンド環境変数へ設定しないでください。Go API側の許可Originには `http://localhost:5193` と `http://127.0.0.1:5193` も含めます。

## Docker開発起動

フロントエンド単体の開発コンテナを起動できます。

```bash
docker compose up --build frontend
```

このcomposeは、Go APIがホスト公開ポート `localhost:9090` で動いている前提で、frontendコンテナから `host.docker.internal:9090` へproxyします。VM上のTeams Botはこのcomposeには含めず、Go APIからTailscale経由で接続します。

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
3. workspace配下の「Teams 会議に入室」画面でTeams会議URLを入力して `会議に入室` を押します。
4. 既存の会議画面へ遷移することを確認します。
5. VM Bot、またはバックエンド手順に沿った手動POSTで `POST /api/v1/transcript-segments` へ文字起こしを投入します。VM BotはTeamsの音声をAzure Speechで文字起こしし、raw audioではなくtranscript segmentをGo APIへ送ります。
6. 認証済みの会議画面に最新の文字起こしが表示されることを確認します。

speaker情報つきの手動POST例:

```json
{
  "sessionId": "manual-speaker-session",
  "eventId": "manual-speaker-test-12345",
  "callId": "manual-speaker-call",
  "sequenceNo": 12345,
  "recognizedAtUtc": "2026-06-27T07:00:00Z",
  "offsetTicks": 0,
  "durationTicks": 10000000,
  "text": "話者情報つきの手動テストです",
  "speakerId": "manual-speaker-001",
  "speakerName": "手動テスト太郎"
}
```

このpayloadを送信すると、該当workspaceの会議中画面のタイムラインに `手動テスト太郎` が表示されます。

## ビルド

ビルド手順は [BUILD.md](./BUILD.md) を参照してください。
