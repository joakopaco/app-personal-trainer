import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createDecipheriv, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const started = Date.now();
const latest = JSON.parse(readFileSync(".local/backups/latest.json"));
const encrypted = readFileSync(latest.file);
if (encrypted.subarray(0, 6).toString() !== "PULSO1")
  throw Error("Unknown backup");
const decipher = createDecipheriv(
  "aes-256-gcm",
  readFileSync(".local/backup-key"),
  encrypted.subarray(6, 18),
);
decipher.setAuthTag(encrypted.subarray(18, 34));
const payload = JSON.parse(
  Buffer.concat([decipher.update(encrypted.subarray(34)), decipher.final()]),
);
const dump = Buffer.from(payload.postgres, "base64");
if (createHash("sha256").update(dump).digest("hex") !== payload.postgresSha256)
  throw Error("Corrupt DB dump");
const database = "pulso_restore_" + Date.now();
if (!/^pulso_restore_\d+$/.test(database)) throw Error("Unsafe destination");
const config = JSON.parse(readFileSync(".local/supabase.json"));
if (config.url !== "http://127.0.0.1:54341") throw Error("Local only");
const api = createClient(config.url, config.serviceKey, {
  auth: { persistSession: false },
});
const testBucket = "restore-" + Date.now();
let bucketMade = false;
try {
  execFileSync("docker", [
    "exec",
    "supabase_db_pulso_mvp",
    "createdb",
    "-U",
    "supabase_admin",
    database,
  ]);
  try {
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_pulso_mvp",
        "pg_restore",
        "-U",
        "supabase_admin",
        "-d",
        database,
        "--no-owner",
        "--exit-on-error",
      ],
      { input: dump, maxBuffer: 20 * 1024 * 1024 },
    );
  } catch (e) {
    throw Error(
      "Isolated restoration failed: " + e.stderr?.toString().slice(-1500),
    );
  }
  const query =
    "select json_build_object('users',(select count(*) from auth.users),'students',(select count(*) from public.students),'sessions',(select count(*) from public.sessions),'sets',(select count(*) from public.session_sets),'events',(select count(*) from public.audit_events))";
  const counts = JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_pulso_mvp",
        "psql",
        "-U",
        "supabase_admin",
        "-d",
        database,
        "-Atc",
        query,
      ],
      { encoding: "utf8" },
    ),
  );
  if (JSON.stringify(counts) !== JSON.stringify(payload.counts))
    throw Error("Restored counts differ");
  const created = await api.storage.createBucket(testBucket, { public: false });
  if (created.error) throw created.error;
  bucketMade = true;
  for (const [i, obj] of payload.objects.entries()) {
    const bytes = Buffer.from(obj.bytes, "base64");
    const name = "check-" + i;
    const up = await api.storage
      .from(testBucket)
      .upload(name, bytes, { contentType: obj.mime });
    if (up.error) throw up.error;
    const got = await api.storage.from(testBucket).download(name);
    if (got.error) throw got.error;
    if (
      createHash("sha256")
        .update(Buffer.from(await got.data.arrayBuffer()))
        .digest("hex") !== obj.sha256
    )
      throw Error("Restored object hash mismatch");
  }
  const grants = execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_pulso_mvp",
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      database,
      "-Atc",
      "select not has_table_privilege('anon','public.students','SELECT') and not has_table_privilege('authenticated','public.students','UPDATE') and (select relrowsecurity from pg_class where oid='public.students'::regclass)",
    ],
    { encoding: "utf8" },
  ).trim();
  if (grants !== "t") throw Error("Restored access rules differ");
  const evidence = {
    passed: true,
    database,
    counts,
    objects: payload.objects.length,
    elapsedSeconds: (Date.now() - started) / 1000,
    backupCapturedAt: payload.capturedAt,
    verifiedAt: new Date().toISOString(),
    limits:
      "Isolated database in local cluster and temporary private bucket. Production project/Auth provider recreation and offsite key storage still require staging rehearsal.",
  };
  writeFileSync(
    ".local/backups/restore-evidence.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
} finally {
  if (bucketMade) {
    await api.storage.emptyBucket(testBucket);
    await api.storage.deleteBucket(testBucket);
  }
  execFileSync("docker", [
    "exec",
    "supabase_db_pulso_mvp",
    "dropdb",
    "-U",
    "supabase_admin",
    "--if-exists",
    database,
  ]);
}
