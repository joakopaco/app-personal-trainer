import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import art from "@pulso/domain/art";
import { catalog } from "@pulso/domain/catalog";
test("curated catalog has distinct entries and all 12 illustrations retain pinned hashes and attribution", () => {
  expect(catalog.length).toBeGreaterThanOrEqual(100);
  expect(catalog.length).toBeLessThanOrEqual(150);
  expect(new Set(catalog.map((e) => e.id)).size).toBe(catalog.length);
  expect(art.length).toBe(12);
  for (const item of art) {
    expect(catalog.some((e) => e.id === item.exerciseId)).toBe(true);
    expect(item.sourceRevision).toMatch(/^[a-f0-9]{40}$/);
    expect(item.attribution.licenseUrl).toContain("creativecommons.org");
    for (const frame of item.frames) {
      const bytes = readFileSync("apps/web/public" + frame.path);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        frame.sha256,
      );
      expect(bytes.toString()).not.toMatch(
        /<script|<foreignObject|<iframe|<image|\bon\w+\s*=|javascript:|(?:href|src)\s*=/i,
      );
      expect(frame.attribution).toBeTruthy();
    }
  }
  expect(catalog.find((e) => e.id === "prensa-de-piernas")?.equipment).toBe(
    "Máquina",
  );
  expect(catalog.find((e) => e.id === "remo-con-barra")?.equipment).toBe(
    "Barra",
  );
});
