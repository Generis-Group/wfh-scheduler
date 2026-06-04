"use client";

import * as React from "react";
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
  const listboxRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const selectedOptions = options.filter((option) =>
    value.includes(option.value),
  );
  const selectedText = selectedOptions.map((option) => option.label).join(", ");
  const triggerId = `multi-select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;

  useDismissableLayer({
    open,
    refs: [wrapperRef],
    onDismiss: () => setOpen(false),
  });

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (typeof listboxRef.current?.scrollIntoView === "function") {
        listboxRef.current.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth",
        });
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [open]);

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
          "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-[8px] border border-[#dfe5ef] bg-[hsl(var(--field))] px-3 text-left text-sm font-medium text-foreground shadow-none ring-0 transition-[background-color,border-color,box-shadow] hover:bg-white focus-visible:border-[#93b4f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#263a55] dark:bg-[hsl(var(--field))] dark:hover:bg-white/[0.075]",
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

      {open ? (
        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={triggerId}
          aria-multiselectable="true"
          className="absolute left-0 top-[calc(100%+0.375rem)] z-[90] max-h-72 w-full min-w-[12rem] scroll-mb-3 scroll-mt-3 overflow-y-auto rounded-[8px] border border-[#dfe5ef] bg-white p-1.5 text-sm shadow-[var(--surface-shadow-strong)] dark:border-[#263a55] dark:bg-[#0f1b2a]"
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
                    : "text-[#344054] hover:bg-[#f6f8fb] dark:text-foreground dark:hover:bg-white/[0.055]",
                )}
                onClick={() => toggleValue(option.value)}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
