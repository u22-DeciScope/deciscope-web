import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { User } from "firebase/auth";
import { onFirebaseUserChanged, signOutOfFirebase } from "~/lib/firebase";

export function useHomeSession() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    onFirebaseUserChanged((currentUser) => setUser(currentUser))
      .then((cleanup) => {
        unsubscribe = cleanup;
      })
      .catch(() => {});
    return () => {
      unsubscribe?.();
    };
  }, []);

  async function handleLogout() {
    await signOutOfFirebase();
    navigate("/login");
  }

  const displayName = user?.displayName ?? "ゲスト";
  const displayEmail = user?.email ?? "";
  const avatarLetter = displayName.charAt(0);

  return { avatarLetter, displayEmail, displayName, handleLogout, today, user };
}
