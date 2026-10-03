import { sendAdministrative } from "@pulso/sync/admin-commands";
import { todayKey } from "@pulso/domain/dates";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { liveQuery } from "dexie";
import {
  LocalStore,
  type StoredStudent,
  type PendingCommand,
} from "@pulso/sync/local-db";
import { AccountLifetime } from "@pulso/sync/account-scope";
import { drainStudent } from "@pulso/sync/worker";
import type {
  CommandEnvelope,
  CommandKind,
  StudentSnapshot,
} from "@pulso/domain/contracts";
import { useAuth } from "../features/auth/AuthProvider";
import { gateway } from "../adapters/supabase-gateway";
import { cloud } from "../adapters/supabase";
type DataValue = {
  db: LocalStore;
  rows: StoredStudent[];
  pending: PendingCommand[];
  error: string;
  refresh: () => Promise<void>;
  suspend: () => void;
  sync: (force?: boolean) => Promise<void>;
  onlineCommand: (
    studentId: string,
    kind: CommandKind,
    payload: Record<string, unknown>,
    revision: number,
  ) => Promise<StudentSnapshot>;
  makeCommand: (
    studentId: string,
    kind: CommandKind,
    payload: Record<string, unknown>,
    revision: number,
  ) => CommandEnvelope;
};
const Context = createContext<DataValue | null>(null);
export function DataProvider({ children }: { children: ReactNode }) {
  const { scope } = useAuth();
  const db = useMemo(
    () => new LocalStore(scope!),
    [scope!.userId, scope!.workspaceId],
  );
  const api = useMemo(() => gateway(scope!), [db]);
  const lifetime = useMemo(() => new AccountLifetime(), [db]);
  const [rows, setRows] = useState<StoredStudent[]>([]),
    [pending, setPending] = useState<PendingCommand[]>([]),
    [error, setError] = useState("");
  const deviceId = useMemo(() => {
    const key = "pulso-device";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  }, []);
  async function refresh() {
    const alive = lifetime.capture();
    if (!alive()) return;
    try {
      let from = 0;
      const ids: string[] = [];
      while (true) {
        const { data, error } = await cloud()
          .from("students")
          .select("id")
          .eq("workspace_id", db.scope.workspaceId)
          .order("id")
          .range(from, from + 99);
        if (error) throw error;
        ids.push(...data.map((s) => s.id));
        if (data.length < 100) break;
        from += 100;
      }
      for (const id of ids) {
        const snapshot = await api.fetchStudent(db.scope, id);
        if (!alive()) return;
        await db.cache(snapshot);

        if (
          snapshot.period &&
          snapshot.period.month < todayKey().slice(0, 7) &&
          !snapshot.sessions.length &&
          !snapshot.student.archived &&
          !(await db.meta.get("admin:" + id)) &&
          !(await db.listPending(id)).length &&
          !(await db.rawInputs.where("studentId").equals(id).count())
        ) {
          if (!alive()) return;
          await onlineCommand(
            id,
            "ensure_period",
            { requestedMonth: todayKey().slice(0, 7) },
            snapshot.revision,
          );
        }
      }
      if (!alive()) return;
      setError("");
    } catch {
      if (!alive()) return;
      setError(
        "Sin conexión al servidor. Podés trabajar con los alumnos ya descargados.",
      );
    }
  }
  async function sync(force = false) {
    const alive = lifetime.capture();
    const ids = [...new Set((await db.listPending()).map((p) => p.studentId))];
    await Promise.all(ids.map((id) => drainStudent(db, id, api, force, alive)));
  }
  useEffect(() => {
    const mount = lifetime.begin();
    let active = true;
    void db.open().catch(() => {
      if (active)
        setError(
          "No se pudo abrir el almacenamiento de este dispositivo. No se pueden guardar cambios.",
        );
    });
    const sub = liveQuery(async () => ({
      rows: await db.students.toArray(),
      pending: await db.listPending(),
    })).subscribe({
      next: (result) => {
        if (active) {
          setRows(result.rows);
          setPending(result.pending);
        }
      },
      error: () => {
        if (active) setError("No se pudo leer el almacenamiento local.");
      },
    });
    const tick = () => {
      if (active) void sync().catch(() => {});
    };
    const update = () => {
      tick();
      if (active) void refresh();
    };
    void refresh();
    const interval = setInterval(tick, 2500);
    window.addEventListener("online", update);
    window.addEventListener("focus", update);
    const channel = cloud()
      .channel("students:" + db.scope.workspaceId)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "students",
          filter: "workspace_id=eq." + db.scope.workspaceId,
        },
        () => {
          if (active) void refresh();
        },
      )
      .subscribe();
    return () => {
      active = false;
      mount.end();
      sub.unsubscribe();
      clearInterval(interval);
      window.removeEventListener("online", update);
      window.removeEventListener("focus", update);
      void cloud().removeChannel(channel);
    };
  }, [db]);
  function makeCommand(
    studentId: string,
    kind: CommandKind,
    payload: Record<string, unknown>,
    revision: number,
  ): CommandEnvelope {
    return {
      schemaVersion: 1,
      operationId: crypto.randomUUID(),
      deviceId,
      workspaceId: db.scope.workspaceId,
      studentId,
      expectedRevision: revision,
      capturedAt: new Date().toISOString(),
      kind,
      payload,
    };
  }
  async function onlineCommand(
    studentId: string,
    kind: CommandKind,
    payload: Record<string, unknown>,
    revision: number,
  ) {
    return sendAdministrative(
      db,
      makeCommand(studentId, kind, payload, revision),
      api.execute,
      lifetime.capture(),
    );
  }

  return (
    <Context.Provider
      value={{
        db,
        rows,
        pending,
        error,
        refresh,
        suspend: () => lifetime.stop(),
        sync,
        onlineCommand,
        makeCommand,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useData() {
  const data = useContext(Context);
  if (!data) throw Error("DataProvider required");
  return data;
}
