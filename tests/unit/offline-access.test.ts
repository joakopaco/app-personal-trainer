import { test, expect } from "vitest";
import { offlineAccess, OFFLINE_WINDOW_MS } from "@pulso/domain/offline-access";
test("cached access expires at 24h and never bypasses a server authorization denial", () => {
  const raw = JSON.stringify({
    userId: "a",
    workspaceId: "w",
    verifiedAt: 100,
  });
  expect(offlineAccess(raw, "a", 101)).toEqual({
    userId: "a",
    workspaceId: "w",
  });
  expect(offlineAccess(raw, "b", 101)).toBeNull();
  expect(offlineAccess(raw, "a", 100 + OFFLINE_WINDOW_MS)).toBeNull();
  expect(offlineAccess(raw, "a", 99)).toBeNull();
  expect(offlineAccess(raw, "a", 101, "42501")).toBeNull();
});
