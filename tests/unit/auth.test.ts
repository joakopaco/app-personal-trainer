import { expect, test } from "vitest";
import { safeReturnPath } from "../../apps/web/src/adapters/auth";
test.each([
  "https://evil.test",
  "//evil.test",
  "/\\evil.test",
  "javascript:alert(1)",
  "/auth/callback",
])("rejects unsafe return target %s", (path) =>
  expect(safeReturnPath(path)).toBe("/hoy"),
);
test("allows only app routes", () =>
  expect(safeReturnPath("/alumnos")).toBe("/alumnos"));
