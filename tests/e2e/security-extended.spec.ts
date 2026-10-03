import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  accountClient,
  adminClient,
  config,
  dropFixture,
} from "../fixtures/cloud";
import { prepared } from "../fixtures/prepared";
test("all private collections deny a second trainer and unconfirmed signup stays anonymous", async () => {
  const a = await prepared(),
    b = await accountClient(1);
  try {
    for (const table of [
      "students",
      "routine_periods",
      "routine_revisions",
      "routine_drafts",
      "schedule_rules",
      "visits",
      "sessions",
      "session_items",
      "session_sets",
      "audit_events",
      "operation_receipts",
      "custom_exercises",
      "exercise_favorites",
      "routine_templates",
      "admin_receipts",
      "import_jobs",
      "legacy_records",
      "deletion_requests",
    ]) {
      const r = await b.client
        .from(table)
        .select("*")
        .eq("workspace_id", a.workspaceId);
      expect(r.error, table).toBeNull();
      expect(r.data, table).toEqual([]);
      const denied = await b.client
        .from(table)
        .delete()
        .eq("workspace_id", a.workspaceId)
        .select();
      expect(denied.error, table).toBeTruthy();
    }
    const anon = createClient(config.url, config.anonKey, {
      auth: { persistSession: false },
    });
    expect((await anon.from("students").select("id")).error).toBeTruthy();
    const signup = await anon.auth.signUp({
      email: "forbidden-" + crypto.randomUUID() + "@pulso.local",
      password: "Test-only-" + crypto.randomUUID(),
    });
    if (signup.data.user)
      await adminClient().auth.admin.deleteUser(signup.data.user.id);
    expect(signup.error).toBeNull();
    expect(signup.data.session).toBeNull();
    expect((await anon.rpc("ensure_workspace")).error).toBeTruthy();
  } finally {
    await dropFixture(a.studentId);
  }
});
