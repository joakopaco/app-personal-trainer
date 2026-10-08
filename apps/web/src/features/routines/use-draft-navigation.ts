import {
  createElement,
  useContext,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";

function RouterDraftBlocker({
  unsafe,
  onBlocked,
  allowed,
}: {
  unsafe: boolean;
  onBlocked: () => void;
  allowed: RefObject<boolean>;
}) {
  const callback = useRef(onBlocked);
  callback.current = onBlocked;
  const blocker = useBlocker(() => {
    if (allowed.current) {
      allowed.current = false;
      return false;
    }
    return unsafe;
  });
  useEffect(() => {
    if (blocker.state === "blocked") {
      callback.current();
      blocker.reset();
    }
  }, [blocker]);
  return null;
}

export function useDraftNavigation(unsafe: boolean, onBlocked: () => void) {
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const allowed = useRef(false);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (!unsafe) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const link = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.("a[href]");
      if (unsafe && anchor && !anchor.hasAttribute("download")) {
        event.preventDefault();
        event.stopPropagation();
        onBlocked();
      }
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", link, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", link, true);
    };
  }, [unsafe, onBlocked]);
  return {
    guard: dataRouter
      ? createElement(RouterDraftBlocker, { unsafe, onBlocked, allowed })
      : null,
    // Only use after an explicitly requested operation is durably complete.
    allowNavigation: () => {
      allowed.current = true;
    },
  };
}
