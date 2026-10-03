import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { prepared } from "../fixtures/prepared";
import {
  accountClient,
  adminClient,
  command,
  execute,
  dropFixture,
} from "../fixtures/cloud";
test("encrypted backup restores real execution, audit, access rules and private media", async () => {
  test.setTimeout(120000);
  const a = await prepared();
  const b = await accountClient(1);
  const path = a.workspaceId + "/restore-test-" + crypto.randomUUID() + ".png";
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEAAAAABJRU5ErkJggg==",
    "base64",
  );
  try {
    const session = a.snapshot.sessions[0];
    const closed = await execute(
      a.client,
      command(
        a.workspaceId,
        a.studentId,
        "finish_session",
        {
          sessionId: session.id,
          quickConfirmItemIds: session.items.map((i: { id: string }) => i.id),
          allowEmpty: false,
        },
        a.snapshot.revision,
      ),
    );
    expect(closed.status).toBe("applied");
    expect(
      (
        await a.client.storage
          .from("exercise-media")
          .upload(path, bytes, { contentType: "image/png" })
      ).error,
    ).toBeNull();
    expect(
      (await b.client.storage.from("exercise-media").download(path)).error,
    ).toBeTruthy();
    expect(
      (
        await b.client.storage
          .from("exercise-media")
          .upload(a.workspaceId + "/forbidden.png", bytes, {
            contentType: "image/png",
          })
      ).error,
    ).toBeTruthy();
    execFileSync(process.execPath, ["scripts/ops/backup-local.mjs"], {
      stdio: "pipe",
      timeout: 60000,
    });
    execFileSync(process.execPath, ["scripts/ops/restore-check-local.mjs"], {
      stdio: "pipe",
      timeout: 60000,
    });
    const evidence = JSON.parse(
      readFileSync(".local/backups/restore-evidence.json", "utf8"),
    );
    expect(evidence.passed).toBe(true);
    expect(evidence.counts.students).toBeGreaterThan(0);
    expect(evidence.counts.sessions).toBeGreaterThan(0);
    expect(evidence.counts.sets).toBeGreaterThan(0);
    expect(evidence.counts.events).toBeGreaterThan(0);
    expect(evidence.objects).toBeGreaterThan(0);
  } finally {
    await adminClient().storage.from("exercise-media").remove([path]);
    await dropFixture(a.studentId);
  }
});
