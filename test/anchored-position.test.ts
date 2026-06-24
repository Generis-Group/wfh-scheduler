import { describe, expect, it } from "vitest";

import { anchoredFixedPlacement } from "@/lib/anchored-position";

function rect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

describe("anchoredFixedPlacement", () => {
  it("aligns an end-anchored menu within the viewport", () => {
    expect(
      anchoredFixedPlacement({
        anchorRect: rect({ left: 760, top: 120, width: 32, height: 32 }),
        preferredWidth: 220,
        preferredMaxHeight: 180,
        viewportWidth: 800,
        viewportHeight: 600,
      }),
    ).toMatchObject({
      left: 568,
      top: 160,
      width: 220,
      maxHeight: 180,
      placement: "bottom",
    });
  });

  it("flips above the anchor when there is not enough room below", () => {
    expect(
      anchoredFixedPlacement({
        anchorRect: rect({ left: 500, top: 540, width: 32, height: 32 }),
        preferredWidth: 220,
        preferredMaxHeight: 180,
        viewportWidth: 800,
        viewportHeight: 600,
        flipHeight: 180,
      }),
    ).toMatchObject({
      top: 352,
      placement: "top",
    });
  });

  it("shrinks menu width and height for constrained viewports", () => {
    expect(
      anchoredFixedPlacement({
        anchorRect: rect({ left: 8, top: 80, width: 32, height: 32 }),
        preferredWidth: 220,
        preferredMaxHeight: 260,
        viewportWidth: 180,
        viewportHeight: 180,
      }),
    ).toMatchObject({
      left: 12,
      width: 156,
      maxHeight: 60,
      placement: "top",
    });
  });
});
