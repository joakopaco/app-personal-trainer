import { createClient, type Session } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: { flowType: "pkce", detectSessionInUrl: false },
      })
    : null;
export function cloud() {
  if (!supabase)
    throw new Error(
      "Falta configurar Supabase. Consultá las instrucciones locales.",
    );
  return supabase;
}
// Bind the mutation to the identity verified by the callback, even if another
// tab changes the shared Auth session while this request is in flight.
export async function updateVerifiedPassword(
  session: Session,
  password: string,
) {
  const bound = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "pulso-password-" + crypto.randomUUID(),
    },
  });
  const signed = await bound.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (signed.error || signed.data.user?.id !== session.user.id)
    throw Error("El acceso validado cambió. Solicitá un enlace nuevo.");
  const changed = await bound.auth.updateUser({ password });
  if (changed.error) throw changed.error;
}
