import type { MouseEvent, PointerEvent } from "react";

const pointerEntries = new WeakSet<HTMLInputElement>();

// WebKit places the caret after focus, undoing select() in onFocus. Reapply
// selection after the first click only; later taps can still position a caret.
export const numericPointerEntry = {
  onPointerDown(event: PointerEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (document.activeElement !== input) pointerEntries.add(input);
    else pointerEntries.delete(input);
  },
  onClick(event: MouseEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (pointerEntries.delete(input)) input.select();
  },
};
