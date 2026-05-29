"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { useDismissableLayer } from "@/components/ui/use-dismissable-layer";
import { cn } from "@/lib/utils";

export type MultiSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type MultiSelectProps = {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  minSelected?: number;
  className?: string;
  triggerClassName?: string;
  "aria-label"?: string;
};

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select options",
  disabled = false,
  minSelected = 0,
  className,
  triggerClassName,
  "aria-label": ariaLabel,
}: MultiSelectProps) {
  const generatedId = React.useId();
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [menuRect, setMenuRect] = React.useState<{
    left: number;
    maxHeight: number;
    top: number;
    width: number;
  } | null>(null);
  const selectedOptions = options.filter((option) =>
    value.includes(option.value),
  );
  const selectedText = selectedOptions.map((option) => option.label).join(", ");
  const triggerId = `multi-select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;

  const updateMenuPosition = React.useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const gap = 6;
    const viewportPadding = 12;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove;
    const availableHeight = Math.max(
      160,
      openBelow ? spaceBelow - gap : spaceAbove - gap,
    );

    setMenuRect({
      left: Math.min(
        Math.max(viewportPadding, rect.left),
        Math.max(
          viewportPadding,
          window.innerWidth - rect.width - viewportPadding,
        ),
      ),
      maxHeight: Math.min(280, availableHeight),
      top: openBelow
        ? rect.bottom + gap
        : Math.max(
            viewportPadding,
            rect.top - gap - Math.min(280, availableHeight),
          ),
      width: rect.width,
    });
  }, []);

  React.useEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useDismissableLayer({
    open,
    refs: [wrapperRef, menuRef],
    onDismiss: () => setOpen(false),
  });

  function orderedValues(nextValues: string[]) {
    const nextValueSet = new Set(nextValues);
    return options
      .filter((option) => nextValueSet.has(option.value))
      .map((option) => option.value);
  }

  function toggleValue(optionValue: string) {
    if (disabled) {
      return;
    }

    const isSelected = value.includes(optionValue);
    const nextValue = isSelected
      ? value.filter((item) => item !== optionValue)
      : [...value, optionValue];

    if (nextValue.length < minSelected) {
      return;
    }

    onChange(orderedValues(nextValue));
  }

  return (
    <div ref={wrapperRef} className={cn("relative min-w-0", className)}>
      <button
        type="button"
        id={triggerId}
        className={cn(
          "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-[8px] bg-white px-3 text-left text-sm font-medium text-[#111827] shadow-none ring-1 ring-[#dfe4ee] transition-colors hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#0b1523] dark:text-foreground dark:ring-[#263a55] dark:hover:bg-white/[0.04]",
          triggerClassName,
        )}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (
            event.key === "ArrowDown" ||
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            selectedOptions.length === 0 &&
              "text-[#667085] dark:text-muted-foreground",
          )}
        >
          {selectedText || placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[#667085] transition-transform dark:text-muted-foreground",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && menuRect && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-labelledby={triggerId}
              aria-multiselectable="true"
              className="fixed z-50 min-w-[12rem] overflow-y-auto rounded-[8px] bg-white p-1.5 text-sm shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#dfe4ee] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
              style={{
                left: menuRect.left,
                maxHeight: menuRect.maxHeight,
                top: menuRect.top,
                width: menuRect.width,
              }}
            >
              {options.map((option) => {
                const selected = value.includes(option.value);
                const locked =
                  selected && value.length <= minSelected && minSelected > 0;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={disabled || option.disabled || locked}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-[7px] px-2.5 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:cursor-not-allowed disabled:opacity-45",
                      selected
                        ? "bg-[#eff6ff] text-[#1d4ed8] dark:bg-blue-400/10 dark:text-blue-100"
                        : "text-[#344054] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5",
                    )}
                    onClick={() => toggleValue(option.value)}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
