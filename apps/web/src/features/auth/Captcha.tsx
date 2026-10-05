import { useEffect, useRef, useState } from "react";
type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
export const captchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as
  string | undefined;
// Only the isolated development backend may run without bot protection.
export const captchaRequired =
  !/^http:\/\/(127\.0\.0\.1|localhost):54341\/?$/.test(
    import.meta.env.VITE_SUPABASE_URL ?? "",
  );
let scriptReady: Promise<Turnstile> | undefined;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptReady)
    scriptReady = new Promise<Turnstile>((resolve, reject) => {
      const script = document.createElement("script");
      const timer = window.setTimeout(() => fail(), 15000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        scriptReady = undefined;
        reject(Error("Captcha unavailable"));
      }
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        if (window.turnstile) resolve(window.turnstile);
        else fail();
      };
      script.onerror = fail;
      document.head.appendChild(script);
    });
  return scriptReady;
}
export function Captcha({
  onToken,
  responsive = false,
}: {
  onToken: (token: string) => void;
  responsive?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!responsive || !element.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setCompact(entry.contentRect.width < 300);
    });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [responsive]);
  useEffect(() => {
    if (!captchaSiteKey) return;
    let active = true,
      widget: string | undefined;
    onToken("");
    setError(false);
    void loadTurnstile()
      .then((api) => {
        if (!active || !element.current) return;
        widget = api.render(element.current, {
          sitekey: captchaSiteKey,
          theme: "light",
          size: compact ? "compact" : "flexible",
          language: "es",
          callback: (token: string) => {
            if (active) {
              setError(false);
              onToken(token);
            }
          },
          "expired-callback": () => {
            if (active) onToken("");
          },
          "error-callback": () => {
            if (active) {
              onToken("");
              setError(true);
            }
          },
        });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (widget !== undefined) window.turnstile?.remove(widget);
    };
  }, [onToken, attempt, compact]);
  if (!captchaSiteKey)
    return captchaRequired ? (
      <p className="error" role="alert">
        El acceso está en preparación. Intentá más tarde.
      </p>
    ) : null;
  return (
    <div>
      <div ref={element} />
      {error && (
        <p className="error" role="alert">
          No pudimos verificar la conexión.{" "}
          <button
            className="link-button"
            type="button"
            onClick={() => setAttempt((x) => x + 1)}
          >
            Reintentar verificación
          </button>
        </p>
      )}
    </div>
  );
}
