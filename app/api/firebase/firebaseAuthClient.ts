import type { User } from "firebase/auth";

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
};

let cachedAuthPromise: Promise<import("firebase/auth").Auth> | null = null;

const firebaseEnv = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
} as const;

export function firebaseConfigStatus() {
  const missing = requiredFirebaseEnvKeys().filter((key) => !String(firebaseEnv[key] ?? "").trim());

  return {
    configured: missing.length === 0,
    missing,
  };
}

export async function signInWithMicrosoft(): Promise<User> {
  const auth = await getFirebaseAuth();
  const { OAuthProvider, signInWithPopup } = await import("firebase/auth");
  const provider = new OAuthProvider("microsoft.com");
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signInWithGoogle(): Promise<User> {
  const auth = await getFirebaseAuth();
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutOfFirebase() {
  const auth = await getFirebaseAuth();
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
}

async function getFirebaseAuth() {
  if (typeof window === "undefined") {
    throw new Error("Firebase Auth is only available in the browser.");
  }
  if (!cachedAuthPromise) {
    cachedAuthPromise = createFirebaseAuth();
  }
  return cachedAuthPromise;
}

async function createFirebaseAuth() {
  const status = firebaseConfigStatus();
  if (!status.configured) {
    throw new Error(`Missing Firebase env: ${status.missing.join(", ")}`);
  }

  const [{ getApp, getApps, initializeApp }, { getAuth }] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
  ]);

  const app = getApps().length > 0 ? getApp() : initializeApp(readConfig());
  return getAuth(app);
}

function readConfig(): FirebaseConfig {
  return {
    apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID),
    appId: String(import.meta.env.VITE_FIREBASE_APP_ID),
    storageBucket: optionalEnv(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: optionalEnv(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  };
}

function optionalEnv(input: unknown) {
  const value = String(input ?? "").trim();
  return value === "" ? undefined : value;
}

function requiredFirebaseEnvKeys(): Array<keyof typeof firebaseEnv> {
  return [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_APP_ID",
  ];
}
