type AnchoredPlacement = "bottom" | "top";
type AnchoredAlignment = "start" | "end";

export type AnchoredFixedPlacement = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: AnchoredPlacement;
};

export function anchoredFixedPlacement({
  anchorRect,
  preferredWidth,
  preferredMaxHeight,
  minHeight = 80,
  flipHeight = minHeight,
  viewportWidth,
  viewportHeight,
  viewportPadding = 12,
  gap = 8,
  placement = "bottom",
  align = "end",
}: {
  anchorRect:
    | DOMRect
    | Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width">;
  preferredWidth: number;
  preferredMaxHeight: number;
  minHeight?: number;
  flipHeight?: number;
  viewportWidth: number;
  viewportHeight: number;
  viewportPadding?: number;
  gap?: number;
  placement?: AnchoredPlacement;
  align?: AnchoredAlignment;
}): AnchoredFixedPlacement {
  const width = Math.min(
    preferredWidth,
    Math.max(1, viewportWidth - viewportPadding * 2),
  );
  const leftEdge =
    align === "start" ? anchorRect.left : anchorRect.right - width;
  const left = Math.min(
    Math.max(viewportPadding, leftEdge),
    Math.max(viewportPadding, viewportWidth - viewportPadding - width),
  );
  const spaceBelow = viewportHeight - anchorRect.bottom - viewportPadding - gap;
  const spaceAbove = anchorRect.top - viewportPadding - gap;
  let resolvedPlacement = placement;

  if (
    resolvedPlacement === "bottom" &&
    spaceBelow < flipHeight &&
    spaceAbove > spaceBelow
  ) {
    resolvedPlacement = "top";
  }

  if (
    resolvedPlacement === "top" &&
    spaceAbove < flipHeight &&
    spaceBelow > spaceAbove
  ) {
    resolvedPlacement = "bottom";
  }

  const availableSpace = Math.max(
    1,
    resolvedPlacement === "top" ? spaceAbove : spaceBelow,
  );
  const maxHeight = Math.min(preferredMaxHeight, availableSpace);
  const top =
    resolvedPlacement === "top"
      ? Math.max(viewportPadding, anchorRect.top - gap - maxHeight)
      : Math.min(
          anchorRect.bottom + gap,
          viewportHeight - viewportPadding - maxHeight,
        );

  return {
    left,
    top,
    width,
    maxHeight,
    placement: resolvedPlacement,
  };
}
