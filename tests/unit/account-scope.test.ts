import { expect, test } from "vitest";
import { AccountLifetime } from "@pulso/sync/account-scope";
test("late result from an old mount is refused even after the same account mounts again", () => {
  const lifetime = new AccountLifetime();
  const first = lifetime.begin();
  expect(first.active()).toBe(true);
  first.end();
  const next = lifetime.begin();
  expect(first.active()).toBe(false);
  expect(next.active()).toBe(true);
});
