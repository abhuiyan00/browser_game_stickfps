import { createClient, type Session } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null when the project has no Supabase credentials configured (see .env.example). */
export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

/** Anonymous sign-in only — no email/password/profile fields are ever collected (NFR-4, zero PII). */
export async function signInAnonymously(): Promise<Session | null> {
  if (!supabase) {
    throw new Error("Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}
