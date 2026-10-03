import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
export const config = JSON.parse(
  readFileSync(".local/supabase.json", "utf8"),
) as { url: string; anonKey: string; serviceKey: string };
if (new URL(config.url).origin !== "http://127.0.0.1:54341")
  throw Error("Fixtures only run on the local instance");
export const accounts = JSON.parse(
  readFileSync(".local/accounts.json", "utf8"),
) as { email: string; password: string; userId: string }[];
export function adminClient() {
  return createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function accountClient(index = 0) {
  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword(accounts[index]);
  if (error) throw error;
  const { data, error: workspaceError } = await client.rpc("ensure_workspace");
  if (workspaceError) throw workspaceError;
  return {
    client,
    workspaceId: data.id as string,
    userId: accounts[index].userId,
  };
}
export function command(
  workspaceId: string,
  studentId: string,
  kind: string,
  payload: unknown,
  expectedRevision = 0,
) {
  return {
    schemaVersion: 1,
    workspaceId,
    studentId,
    operationId: randomUUID(),
    deviceId: randomUUID(),
    capturedAt: new Date().toISOString(),
    expectedRevision,
    kind,
    payload,
  };
}
export async function execute(
  client: SupabaseClient,
  c: ReturnType<typeof command>,
) {
  const { data, error } = await client.rpc("apply_training_command", {
    command: c,
  });
  if (error) throw error;
  return data;
}
export async function createStudent(index = 0) {
  const a = await accountClient(index);
  const studentId = randomUUID();
  const result = await execute(
    a.client,
    command(a.workspaceId, studentId, "create_student", {
      name: "Prueba " + studentId.slice(0, 8),
    }),
  );
  if (result.status !== "applied") throw Error(JSON.stringify(result));
  return { ...a, studentId, revision: result.revision };
}
export async function dropFixture(studentId: string) {
  const { error } = await adminClient()
    .from("students")
    .delete()
    .eq("id", studentId);
  if (error) throw error;
}
