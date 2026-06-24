// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportDateSwitcher } from "@/components/reports/report-date-switcher";

describe("ReportDateSwitcher", () => {
  it("renders the picker in a portal so parent overflow cannot clip it", () => {
    const onChange = vi.fn();

    render(
      <div className="overflow-hidden">
        <ReportDateSwitcher
          value="2026-05-19"
          maxDate="2026-05-21"
          onChange={onChange}
        />
      </div>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open report date picker" }),
    );

    const picker = screen.getByRole("dialog", {
      name: "Report date picker",
    });

    expect(picker.parentElement).toBe(document.body);
    expect(
      within(picker).getByRole("button", { name: "Select May 20, 2026" }),
    ).toBeTruthy();
  });

  it("selects dates from the portaled picker", () => {
    const onChange = vi.fn();

    render(
      <ReportDateSwitcher
        value="2026-05-19"
        maxDate="2026-05-21"
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open report date picker" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Report date picker" }))
        .getByRole("button", { name: "Select May 20, 2026" }),
    );

    expect(onChange).toHaveBeenCalledWith("2026-05-20", "picker");
  });
});
