// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MultiSelect } from "@/components/ui/multi-select";

const options = [
  { value: "it", label: "IT" },
  { value: "production", label: "Production" },
  { value: "finance", label: "Finance" },
];

describe("MultiSelect", () => {
  it("renders its menu in a portal so scroll containers cannot clip it", () => {
    const onChange = vi.fn();

    render(
      <div className="overflow-hidden">
        <MultiSelect
          aria-label="Departments"
          options={options}
          value={["it"]}
          onChange={onChange}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Departments" }));

    const listbox = screen.getByRole("listbox");

    expect(listbox.parentElement).toBe(document.body);
    expect(within(listbox).getByRole("option", { name: "Production" }))
      .toBeTruthy();
  });

  it("keeps selected values ordered by the option list", () => {
    const onChange = vi.fn();

    render(
      <MultiSelect
        aria-label="Departments"
        options={options}
        value={["finance"]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Departments" }));
    fireEvent.click(
      within(screen.getByRole("listbox")).getByRole("option", { name: "IT" }),
    );

    expect(onChange).toHaveBeenCalledWith(["it", "finance"]);
  });
});
