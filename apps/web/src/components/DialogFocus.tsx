import { useEffect } from "react";
// All application dialogs share the modal container and an explicit close action.
export function DialogFocus() {
  useEffect(() => {
    let dialog: HTMLElement | null = null,
      previous: HTMLElement | null = null;
    const controls = () =>
      dialog
        ? Array.from(
            dialog.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
            ),
          ).filter((e) => e.getClientRects().length)
        : [];
    const update = () => {
      const next = document.querySelector<HTMLElement>(
        ".document-preview, .modal-backdrop .modal",
      );
      if (next === dialog) return;
      if (!next) {
        dialog = null;
        previous?.focus();
        return;
      }
      previous = document.activeElement as HTMLElement;
      dialog = next;
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      const title = dialog.querySelector("h2");
      if (title && !dialog.hasAttribute("aria-label")) {
        title.id ||= "dialog-" + crypto.randomUUID();
        dialog.setAttribute("aria-labelledby", title.id);
      }
      if (!dialog.contains(document.activeElement)) {
        const target = controls()[0];
        if (target) target.focus();
        else {
          dialog.tabIndex = -1;
          dialog.focus();
        }
      }
    };
    const keydown = (e: KeyboardEvent) => {
      if (!dialog) return;
      if (e.key === "Escape") {
        const close = Array.from(
          dialog.querySelectorAll<HTMLButtonElement>("button"),
        ).find(
          (b) =>
            b.hasAttribute("data-dialog-close") ||
            /^(Cerrar|Cancelar|Seguir entrenando|Volver)$/.test(
              b.textContent?.trim() ?? "",
            ),
        );
        if (close && !close.disabled) {
          e.preventDefault();
          close.click();
        }
      } else if (e.key === "Tab") {
        const list = controls(),
          first = list[0],
          last = list.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !dialog.contains(document.activeElement))
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !dialog.contains(document.activeElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", keydown);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", keydown);
    };
  }, []);
  return null;
}
