"use client";

import type { RefObject } from "react";
import { useEffect } from "react";

type DismissableLayerOptions = {
  open: boolean;
  refs: Array<RefObject<Element | null>>;
  onDismiss: () => void;
};

export function useDismissableLayer({
  open,
  refs,
  onDismiss,
}: DismissableLayerOptions) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function isInsideLayer(event: Event) {
      const target = event.target as Node | null;
      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [];

      return refs.some((ref) => {
        const element = ref.current;

        return Boolean(
          element &&
            ((target && element.contains(target)) || path.includes(element)),
        );
      });
    }

    function handlePointerDown(event: PointerEvent) {
      if (!isInsideLayer(event)) {
        onDismiss();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onDismiss, open, refs]);
}
