import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createCipheriv, randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const config = JSON.parse(readFileSync(".local/supabase.json"));
if (config.url !== "http://127.0.0.1:54341")
  throw Error("This rehearsal is restricted to Pulso local.");
const api = createClient(config.url, config.serviceKey, {
  auth: { persistSession: false },
});
const bytes = execFileSync(
  "docker",
  [
    "exec",
    "supabase_db_pulso_mvp",
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-Fc",
    "--no-owner",
  ],
  { maxBuffer: 100 * 1024 * 1024 },
);
const { data: buckets, error } = await api.storage.listBuckets();
if (error) throw error;
const objects = [];
async function list(bucket, prefix = "") {
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await api.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    for (const entry of data) {
      const name = prefix ? prefix + "/" + entry.name : entry.name;
      if (!entry.id) {
        await list(bucket, name);
        continue;
      }
      const { data: file, error: downloadError } = await api.storage
        .from(bucket)
        .download(name);
      if (downloadError) throw downloadError;
      const dataBytes = Buffer.from(await file.arrayBuffer());
      objects.push({
        bucket,
        name,
        mime: file.type,
        bytes: dataBytes.toString("base64"),
        sha256: createHash("sha256").update(dataBytes).digest("hex"),
      });
    }
    if (data.length < 100) break;
  }
}
for (const b of buckets) await list(b.id);
const counts = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_pulso_mvp",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      "select json_build_object('users',(select count(*) from auth.users),'students',(select count(*) from public.students),'sessions',(select count(*) from public.sessions),'sets',(select count(*) from public.session_sets),'events',(select count(*) from public.audit_events))",
    ],
    { encoding: "utf8" },
  ),
);
mkdirSync(".local/backups", { recursive: true });
const keyPath = ".local/backup-key";
if (!existsSync(keyPath))
  writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
const key = readFileSync(keyPath);
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const payload = Buffer.from(
  JSON.stringify({
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    postgres: bytes.toString("base64"),
    postgresSha256: createHash("sha256").update(bytes).digest("hex"),
    objects,
    buckets,
    counts,
    authConfiguration: readFileSync("supabase/config.toml", "utf8"),
  }),
);
const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
const output = ".local/backups/pulso-" + Date.now() + ".enc";
writeFileSync(
  output,
  Buffer.concat([Buffer.from("PULSO1"), iv, cipher.getAuthTag(), encrypted]),
);
writeFileSync(
  ".local/backups/latest.json",
  JSON.stringify({
    file: output,
    capturedAt: new Date().toISOString(),
    counts,
    objectCount: objects.length,
  }),
);
console.log(
  JSON.stringify({
    file: output,
    counts,
    objects: objects.length,
    encrypted: true,
    scope: "local rehearsal; key must be stored separately for production",
  }),
);
