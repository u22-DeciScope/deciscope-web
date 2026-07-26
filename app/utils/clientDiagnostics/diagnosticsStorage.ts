import type { DiagnosticEvent } from "~/utils/clientDiagnostics/diagnosticsTypes";

// 診断イベントのブラウザ内永続化。IndexedDBを優先し、利用不可(SSR/プライベート
// モード/古い環境)なら黙ってメモリのみに縮退する。ここでの失敗は一切
// 呼び出し側へ伝播させない — 診断機能の不調が会議画面へ影響してはならない。

const DATABASE_NAME = "deciscope-client-diagnostics";
const DATABASE_VERSION = 1;
const STORE_NAME = "events";

export type StoredDiagnosticRecord = {
  // recordKey は「ページ読み込みID + 連番」。リロード後に採番し直される
  // 連番だけをキーにすると、前回読み込み分のレコードを上書きしてしまうため、
  // 読み込み単位のIDを前置して衝突を避ける。
  recordKey: string;
  sequence: number;
  sent: boolean;
  event: DiagnosticEvent;
};

let databasePromise: Promise<IDBDatabase | null> | null = null;
let unavailable = false;

function indexedDBFactory(): IDBFactory | null {
  if (typeof globalThis === "undefined") {
    return null;
  }
  const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  return factory ?? null;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (unavailable) {
    return Promise.resolve(null);
  }
  if (databasePromise) {
    return databasePromise;
  }
  const factory = indexedDBFactory();
  if (!factory) {
    unavailable = true;
    return Promise.resolve(null);
  }
  databasePromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "recordKey" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        unavailable = true;
        resolve(null);
      };
      request.onblocked = () => resolve(null);
    } catch {
      unavailable = true;
      resolve(null);
    }
  });
  return databasePromise;
}

async function withStore(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => void,
): Promise<void> {
  try {
    const database = await openDatabase();
    if (!database) {
      return;
    }
    await new Promise<void>((resolve) => {
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(STORE_NAME, mode);
      } catch {
        resolve();
        return;
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
      try {
        run(transaction.objectStore(STORE_NAME));
      } catch {
        resolve();
      }
    });
  } catch {
    // 永続化は best-effort。
  }
}

// persistDiagnosticRecord は1件を保存する(既存キーは上書き)。
export function persistDiagnosticRecord(record: StoredDiagnosticRecord): void {
  void withStore("readwrite", (store) => {
    store.put(record);
  });
}

// markDiagnosticRecordsSent は送信済みフラグを立てる。ダウンロード用に本体は残す。
export function markDiagnosticRecordsSent(recordKeys: string[]): void {
  if (recordKeys.length === 0) {
    return;
  }
  void withStore("readwrite", (store) => {
    for (const recordKey of recordKeys) {
      const request = store.get(recordKey);
      request.onsuccess = () => {
        const existing = request.result as StoredDiagnosticRecord | undefined;
        if (existing) {
          store.put({ ...existing, sent: true });
        }
      };
    }
  });
}

// dropDiagnosticRecords はリングバッファから溢れた分を削除する。
export function dropDiagnosticRecords(recordKeys: string[]): void {
  if (recordKeys.length === 0) {
    return;
  }
  void withStore("readwrite", (store) => {
    for (const recordKey of recordKeys) {
      store.delete(recordKey);
    }
  });
}

// loadPersistedDiagnosticRecords は前回タブ/リロード前の記録を読み出す。
// 起動時に未送信イベントを拾い直し、ダウンロードにも使う。
export async function loadPersistedDiagnosticRecords(): Promise<StoredDiagnosticRecord[]> {
  try {
    const database = await openDatabase();
    if (!database) {
      return [];
    }
    return await new Promise<StoredDiagnosticRecord[]>((resolve) => {
      try {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve((request.result as StoredDiagnosticRecord[]) ?? []);
        request.onerror = () => resolve([]);
        transaction.onerror = () => resolve([]);
        transaction.onabort = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  } catch {
    return [];
  }
}

export function resetDiagnosticsStorageForTest() {
  databasePromise = null;
  unavailable = false;
}
