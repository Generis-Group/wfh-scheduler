// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaginationControls } from "@/components/ui/pagination-controls";
import { paginationPageSizeOptions } from "@/lib/pagination";

afterEach(() => {
  cleanup();
});

describe("PaginationControls", () => {
  it("uses the app-wide row options and stays visible for a single page", () => {
    render(
      <PaginationControls
        page={1}
        pageSize={10}
        totalItems={3}
        itemLabel="test items"
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("test items pagination")).toBeTruthy();
    expect(screen.getByLabelText("Previous page")).toBeTruthy();
    expect(screen.getByLabelText("Next page")).toBeTruthy();
    expect(screen.getByLabelText("Page 1")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Rows per page"));

    const options = screen
      .getAllByRole("option")
      .map((option) => Number(option.textContent));

    expect(options).toEqual([...paginationPageSizeOptions]);
  });
});
