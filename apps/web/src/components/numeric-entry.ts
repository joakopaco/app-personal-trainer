import type { PointerEvent } from "react";

// WebKit can place the caret after focus, undoing select() in onFocus. Handle
// entry before native caret placement; later taps can still position a caret.
export const numericPointerEntry = {
  onPointerDown(event: PointerEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (event.button !== 0 || document.activeElement === input) return;
    event.preventDefault();
    input.focus();
    input.select();
  },
};
