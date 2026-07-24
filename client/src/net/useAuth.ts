import { useEffect, useState } from "react";
import { signInAnonymously, supabase } from "./supabaseClient";

export type AuthStatus = "idle" | "signing-in" | "signed-in" | "error" | "not-configured";

export interface UseAuthResult {
  status: AuthStatus;
  userId: string | null;
  error: string | null;
}

export function useAuth(): UseAuthResult {
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setStatus("not-configured");
      return;
    }

    let cancelled = false;
    setStatus("signing-in");

    signInAnonymously()
      .then((session) => {
        if (cancelled) return;
        setUserId(session?.user.id ?? null);
        setStatus("signed-in");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { status, userId, error };
}
