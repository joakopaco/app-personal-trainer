export type UUID = string;
export type AccountScope = Readonly<{ userId: UUID; workspaceId: UUID }>;
export type SaveState =
  | "local-writing"
  | "local-saved"
  | "syncing"
  | "synced"
  | "conflict"
  | "local-error"
  | "auth-required";
import { z } from "zod";
import { routineSchema, prescriptionSchema } from "./routines";
export const studentSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  name: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  gender: z
    .enum(["masculino", "femenino", "otro", "no_especificado"])
    .optional(),
  alias: z.string(),
  notes: z.string(),
  archived: z.boolean(),
  revision: z.number().int(),
  created_at: z.string(),
});
export type Student = z.infer<typeof studentSchema>;
export const periodSchema = z.object({
  id: z.uuid(),
  month: z.string(),
  current_revision_id: z.uuid(),
  continued_from: z.uuid().nullable(),
});
export const visitSchema = z.object({
  id: z.uuid(),
  student_id: z.uuid(),
  date: z.string(),
  time: z.string(),
  status: z.enum([
    "pending",
    "open",
    "closed",
    "absent",
    "rescheduled",
    "cancelled",
  ]),
  source: z.string(),
  rescheduled_from: z.uuid().nullable(),
});
export const setSchema = z.object({
  id: z.uuid(),
  ordinal: z.number(),
  state: z.enum(["pending", "done", "skipped"]),
  source: z.enum(["pending", "observed", "quick_confirmed"]),
  weight: z.number().nullable(),
  reps: z.number().nullable(),
  duration_sec: z.number().nullable(),
});
export const sessionItemSchema = z.object({
  id: z.uuid(),
  position_id: z.uuid(),
  lineage_id: z.uuid(),
  block_id: z.uuid(),
  block_name: z.string(),
  exercise_id: z.string(),
  name: z.string(),
  group: z.string(),
  type: z.enum(["load_reps", "reps", "time"]),
  warmup: z.boolean(),
  ordinal: z.number(),
  skipped: z.boolean(),
  prescription: prescriptionSchema,
  macro_rest: z.number().nullable(),
  macro_target: z.string(),
  sets: z.array(setSchema),
});
export const sessionSchema = z.object({
  id: z.uuid(),
  student_id: z.uuid(),
  period_id: z.uuid(),
  routine_revision_id: z.uuid(),
  day_id: z.uuid(),
  week: z.number(),
  status: z.enum(["open", "closed"]),
  date: z.string(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  items: z.array(sessionItemSchema),
});
export const snapshotSchema = z.object({
  student: studentSchema,
  schedule: z
    .object({
      weekdays: z.array(z.number().int()),
      time: z.string(),
      day_times: z.record(z.string(), z.string()),
    })
    .nullable()
    .optional(),
  revision: z.number().int(),
  period: periodSchema.nullable(),
  routine: z.object({ id: z.uuid(), document: routineSchema }).nullable(),
  sessions: z.array(sessionSchema),
  visits: z.array(visitSchema),
});
export type StudentSnapshot = z.infer<typeof snapshotSchema>;
export type StudentPatch = StudentSnapshot;
export type TrainingSession = z.infer<typeof sessionSchema>;
export type SessionItem = z.infer<typeof sessionItemSchema>;
export type CommandKind =
  | "create_student"
  | "update_student"
  | "archive_student"
  | "start_session"
  | "adjust_prescription"
  | "record_set"
  | "skip_item"
  | "finish_session"
  | "correct_result"
  | "mark_absent"
  | "cancel_visit"
  | "reschedule_visit"
  | "save_draft"
  | "publish_routine"
  | "ensure_period"
  | "reconcile_offline_session"
  | "create_visit"
  | "save_schedule";
export type CommandEnvelope = {
  schemaVersion: 1;
  operationId: UUID;
  deviceId: UUID;
  workspaceId: UUID;
  studentId: UUID;
  expectedRevision: number;
  capturedAt: string;
  kind: CommandKind;
  payload: Record<string, unknown>;
};
export type CommandReply =
  | {
      status: "applied" | "duplicate";
      operationId: UUID;
      revision: number;
      patch: StudentPatch;
    }
  | { status: "conflict"; revision: number; current: StudentSnapshot }
  | { status: "rejected"; code: string; message: string };
export interface CloudGateway {
  fetchStudent(scope: AccountScope, studentId: UUID): Promise<StudentSnapshot>;
  execute(command: CommandEnvelope): Promise<CommandReply>;
}
