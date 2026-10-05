// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete window.turnstile;
  vi.resetModules();
});

test("narrow administrative CAPTCHA switches to compact and renews the token after resizing", async () => {
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "public-test-key");
  let resize: ResizeObserverCallback;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const renderWidget = vi.fn().mockReturnValue("widget");
  const removeWidget = vi.fn();
  window.turnstile = { render: renderWidget, remove: removeWidget };
  const { Captcha } = await import("../../apps/web/src/features/auth/Captcha");
  const token = vi.fn();
  render(<Captcha onToken={token} responsive />);
  await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));
  act(() =>
    resize(
      [{ contentRect: { width: 230 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    ),
  );
  await waitFor(() =>
    expect(renderWidget).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ size: "compact" }),
    ),
  );
  expect(removeWidget).toHaveBeenCalledWith("widget");
  expect(token).toHaveBeenLastCalledWith("");
  act(() =>
    resize(
      [{ contentRect: { width: 414 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    ),
  );
  await waitFor(() =>
    expect(renderWidget).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ size: "flexible" }),
    ),
  );
});
