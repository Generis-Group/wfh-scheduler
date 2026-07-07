"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { useDismissableLayer } from "@/components/ui/use-dismissable-layer";
import { anchoredFixedPlacement } from "@/lib/anchored-position";
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

type MenuPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
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
  const listboxRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState<MenuPosition | null>(
    null,
  );
  const selectedOptions = options.filter((option) =>
    value.includes(option.value),
  );
  const selectedText = selectedOptions.map((option) => option.label).join(", ");
  const triggerId = `multi-select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;

  const updateMenuPosition = React.useCallback(() => {
    if (typeof window === "undefined" || !wrapperRef.current) {
      return;
    }

    const rect = wrapperRef.current.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const menuWidth = Math.max(rect.width, 192);
    const placement = anchoredFixedPlacement({
      anchorRect: rect,
      preferredWidth: menuWidth,
      preferredMaxHeight: 288,
      minHeight: 80,
      flipHeight: 180,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      viewportPadding: margin,
      gap,
      align: "start",
    });

    setMenuPosition({
      left: placement.left,
      top: placement.top,
      width: placement.width,
      maxHeight: placement.maxHeight,
    });
  }, []);

  useDismissableLayer({
    open,
    refs: [wrapperRef, listboxRef],
    onDismiss: () => setOpen(false),
  });

  React.useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return undefined;
    }

    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    updateMenuPosition();

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

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
    <div
      ref={wrapperRef}
      className={cn("relative min-w-0", open && "z-[80]", className)}
    >
      <button
        type="button"
        id={triggerId}
        className={cn(
          "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-[hsl(var(--field))] px-3 text-left text-sm font-medium text-foreground shadow-none ring-0 transition-[background-color,border-color,box-shadow] hover:bg-white focus-visible:border-[#93b4f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-[hsl(var(--field))] dark:hover:bg-white/[0.075]",
          triggerClassName,
        )}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }

          updateMenuPosition();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (
            event.key === "ArrowDown" ||
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            updateMenuPosition();
            setOpen(true);
          }
        }}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            selectedOptions.length === 0 &&
              "text-muted-foreground dark:text-muted-foreground",
          )}
        >
          {selectedText || placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform dark:text-muted-foreground",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={listboxRef}
              id={listboxId}
              role="listbox"
              aria-labelledby={triggerId}
              aria-multiselectable="true"
              className="fixed z-[1000] overflow-y-auto overscroll-contain rounded-lg border border-border bg-white p-1.5 text-sm shadow-[var(--surface-shadow-strong)] [scrollbar-gutter:stable] dark:border-border dark:bg-card"
              style={{
                left: menuPosition?.left ?? 0,
                top: menuPosition?.top ?? 0,
                width: menuPosition?.width,
                maxHeight: menuPosition?.maxHeight,
                visibility: menuPosition ? "visible" : "hidden",
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
                      "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45",
                      selected
                        ? "bg-primary-subtle text-primary-subtle-foreground dark:bg-blue-400/10 dark:text-blue-100"
                        : "text-foreground-muted hover:bg-surface-subtle dark:text-foreground dark:hover:bg-white/[0.055]",
                    )}
                    onClick={() => toggleValue(option.value)}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {selected ? (
                      <Check className="h-4 w-4 shrink-0" />
                    ) : null}
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
