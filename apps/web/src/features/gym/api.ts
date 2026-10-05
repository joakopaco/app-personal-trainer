import { useEffect, useState } from "react";
import { cloud } from "../../adapters/supabase";
import type { RoutineDay, RoutineDocument } from "@pulso/domain/routines";

export type GymAccess = {
  mode: "admin" | "member" | "trainer" | "pending";
  userId: string;
  gymId: string;
  gymName: string;
  name: string;
  email: string;
  gender: string;
  selectedRevisionId: string | null;
  mustChangePassword: boolean;
  blocked: boolean;
  operator: boolean;
};
export type GymAccount = {
  user_id: string;
  gym_id: string;
  name: string;
  email: string;
  role: string;
  gender: string;
  active: boolean;
  must_change_password: boolean;
  selected_revision_id: string | null;
  created_at: string;
};
export type GymRoutine = {
  id: string;
  gym_id: string;
  kind: "catalog" | "personal" | "own";
  member_id: string | null;
  name: string;
  revision: number;
  published_revision_id: string | null;
  retired: boolean;
  has_draft: boolean;
  created_at: string;
  updated_at: string;
};
export type GymRevision = {
  id: string;
  routine_id: string;
  document: RoutineDocument;
  created_at: string;
};
export type GymResult = {
  positionId: string;
  skipped: boolean;
  sets: {
    weight: number | null;
    reps: number | null;
    durationSec: number | null;
    confirmed: boolean;
  }[];
};
export type GymSession = {
  id: string;
  member_id: string;
  routine_name: string;
  routine_revision_id: string;
  week: number;
  day: RoutineDay;
  results: GymResult[];
  revision: number;
  status: "open" | "finished";
  started_at: string;
  finished_at: string | null;
};
export const accountColumns =
  "user_id,gym_id,name,email,role,gender,active,must_change_password,selected_revision_id,created_at";
export const routineColumns =
  "id,gym_id,kind,member_id,name,revision,published_revision_id,retired,has_draft,created_at,updated_at";
export const dateLabel = (v: string) =>
  new Date(v).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export function gymError(e: unknown): string {
  const error = e as { code?: string; message?: string };
  if (error.code === "40001")
    return "Esto cambió en otra pestaña. Volvé a abrirlo antes de guardar; tus cambios se conservan.";
  if (error.code === "42501")
    return "No tenés acceso a esta acción. Revisá tu cuenta o consultá con tu gimnasio.";
  if (error.code === "23505")
    return "Ya existe una rutina propia. Abrila para editarla.";
  if (error.code === "22023")
    return "Revisá los datos. Para publicar, completá todos los días, ejercicios y series.";
  return error.message?.startsWith("Failed to fetch")
    ? "Sin conexión. Reintentá cuando vuelva la conexión."
    : error.message || "No se pudo completar. Reintentá.";
}
export async function command(
  kind: string,
  payload: object,
  operationId: string = crypto.randomUUID(),
) {
  const { data, error } = await cloud().rpc("gym_command", {
    command: { operationId, kind, payload },
  });
  if (error) throw error;
  return data as { id: string; revision: number; publishedRevisionId?: string };
}
export async function accountAction(body: object) {
  const { data, error } = await cloud().functions.invoke("gym-accounts", {
    body,
  });
  if (error) {
    let message =
      "No se pudo completar la solicitud. Revisá tu conexión y reintentá.";
    try {
      message = (await error.context.json()).error || message;
    } catch {
      /* A network error has no JSON response. */
    }
    throw Error(message);
  }
  return data as {
    userId: string;
    gymId: string;
    temporaryPassword?: string;
    alreadyCreated?: boolean;
  };
}
export async function rows<T>(
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data as T;
}
export function useResource<T>(load: () => Promise<T>, key: string) {
  const [value, setValue] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setValue(null);
    load()
      .then((data) => {
        if (live) setValue(data);
      })
      .catch((e) => {
        if (live) setError(gymError(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [key, version]);
  return { value, error, loading, reload: () => setVersion((v) => v + 1) };
}
