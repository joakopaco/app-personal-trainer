import { offlineAccess } from "@pulso/domain/offline-access";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountScope } from "@pulso/domain/contracts";
import { supabase } from "../../adapters/supabase";
type AuthValue = {
  session: Session | null;
  scope: AccountScope | null;
  loading: boolean;
  error: string;
  retry: () => void;
  recovery: boolean;
  finishRecovery: () => void;
};
const Context = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [scope, setScope] = useState<AccountScope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [recovery, setRecovery] = useState(
    location.pathname === "/auth/callback",
  );
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(next);
      if (!next) {
        setScope(null);
        setLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (active) {
        setSession(data.session);
        if (error)
          setError("No se pudo recuperar el acceso. Volvé a ingresar.");
        if (!data.session) setLoading(false);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const userId = session?.user.id;
  useEffect(() => {
    let active = true;
    setScope(null);
    if (!userId || !supabase) return;
    setLoading(true);
    setError("");
    supabase.rpc("ensure_workspace").then(({ data, error }) => {
      if (!active) return;
      if (error) {
        const access = offlineAccess(
          localStorage.getItem("pulso-access:" + userId),
          userId,
          Date.now(),
          error.code,
        );
        if (access) setScope(Object.freeze(access));
        else
          setError(
            "Reconectá para verificar tu acceso. Tus cambios locales se conservan.",
          );
      } else {
        setScope(Object.freeze({ userId, workspaceId: data.id }));
        localStorage.setItem(
          "pulso-access:" + userId,
          JSON.stringify({
            userId,
            workspaceId: data.id,
            verifiedAt: Date.now(),
          }),
        );
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId, attempt]);
  useEffect(() => {
    if (!userId || !scope) return;
    const timer = setInterval(() => {
      const raw = localStorage.getItem("pulso-access:" + userId);
      if (!offlineAccess(raw, userId)) {
        setScope(null);
        setError(
          "Se cumplió el plazo de acceso sin conexión. Reconectá para continuar; tus cambios locales se conservan.",
        );
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [userId, scope]);
  return (
    <Context.Provider
      value={{
        session,
        scope: scope?.userId === userId ? scope : null,
        loading,
        error,
        retry: () => setAttempt((x) => x + 1),
        recovery,
        finishRecovery: () => setRecovery(false),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw Error("AuthProvider required");
  return value;
}
