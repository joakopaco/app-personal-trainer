import { test, expect } from "vitest";
import { catalog } from "@pulso/domain/catalog";
test("curated catalog has distinct entries and accurate material", () => {
  expect(catalog.length).toBeGreaterThanOrEqual(100);
  expect(catalog.length).toBeLessThanOrEqual(150);
  expect(new Set(catalog.map((e) => e.id)).size).toBe(catalog.length);
  expect(catalog.find((e) => e.id === "prensa-de-piernas")?.equipment).toBe(
    "Máquina",
  );
  expect(catalog.find((e) => e.id === "remo-con-barra")?.equipment).toBe(
    "Barra",
  );
});
