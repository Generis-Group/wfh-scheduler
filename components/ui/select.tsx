import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type SelectOption = {
  value: string;
  label: string;
  disabled: boolean;
};
type MenuPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  menuPlacement?: "bottom" | "top";
};

function optionText(value: React.ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(optionText).join("");
  }

  return "";
}

function selectOptions(children: React.ReactNode): SelectOption[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (
      !React.isValidElement<React.OptionHTMLAttributes<HTMLOptionElement>>(
        child,
      )
    ) {
      return [];
    }

    const props = child.props;
    const label = props.label ?? optionText(props.children);

    return {
      value: String(props.value ?? label),
      label,
      disabled: Boolean(props.disabled),
    };
  });
}

function selectValue(value: unknown) {
  if (Array.isArray(value)) {
    return String(value[0] ?? "");
  }

  return value === undefined || value === null ? "" : String(value);
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      children,
      disabled,
      value,
      defaultValue,
      onChange,
      id,
      name,
      required,
      menuPlacement = "bottom",
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const selectRef = React.useRef<HTMLSelectElement>(null);
    const wrapperRef = React.useRef<HTMLSpanElement>(null);
    const listboxRef = React.useRef<HTMLDivElement>(null);
    const options = React.useMemo(() => selectOptions(children), [children]);
    const [open, setOpen] = React.useState(false);
    const [menuPosition, setMenuPosition] = React.useState<MenuPosition | null>(
      null,
    );
    const [internalValue, setInternalValue] = React.useState(() =>
      selectValue(defaultValue ?? options[0]?.value ?? ""),
    );
    const selectedValue =
      value !== undefined ? selectValue(value) : internalValue;
    const selectedOption =
      options.find((option) => option.value === selectedValue) ?? options[0];
    const triggerId = id ?? `select-${generatedId}`;
    const listboxId = `${triggerId}-listbox`;

    React.useImperativeHandle(
      ref,
      () => selectRef.current as HTMLSelectElement,
    );

    const updateMenuPosition = React.useCallback(() => {
      if (typeof window === "undefined" || !wrapperRef.current) {
        return;
      }

      const rect = wrapperRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const margin = 8;
      const gap = 6;
      const menuWidth = Math.max(rect.width, 192);
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, viewportWidth - margin - menuWidth),
      );
      const spaceBelow = viewportHeight - rect.bottom - margin - gap;
      const spaceAbove = rect.top - margin - gap;
      let placement = menuPlacement;

      if (
        placement === "bottom" &&
        spaceBelow < 180 &&
        spaceAbove > spaceBelow
      ) {
        placement = "top";
      }

      if (placement === "top" && spaceAbove < 180 && spaceBelow > spaceAbove) {
        placement = "bottom";
      }

      const availableSpace = Math.max(
        80,
        placement === "top" ? spaceAbove : spaceBelow,
      );
      const maxHeight = Math.min(256, availableSpace);
      const top =
        placement === "top"
          ? Math.max(margin, rect.top - gap - maxHeight)
          : Math.min(rect.bottom + gap, viewportHeight - margin - maxHeight);

      setMenuPosition({
        left,
        top,
        width: menuWidth,
        maxHeight,
      });
    }, [menuPlacement]);

    React.useEffect(() => {
      if (!open) {
        setMenuPosition(null);
        return;
      }

      function handlePointerDown(event: PointerEvent) {
        const target = event.target as Node;

        if (
          !wrapperRef.current?.contains(target) &&
          !listboxRef.current?.contains(target)
        ) {
          setOpen(false);
        }
      }

      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
          setOpen(false);
        }
      }

      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      window.addEventListener("resize", updateMenuPosition);
      window.addEventListener("scroll", updateMenuPosition, true);
      updateMenuPosition();

      return () => {
        document.removeEventListener("pointerdown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("resize", updateMenuPosition);
        window.removeEventListener("scroll", updateMenuPosition, true);
      };
    }, [open, updateMenuPosition]);

    function chooseOption(nextValue: string) {
      if (disabled || nextValue === selectedValue) {
        setOpen(false);
        return;
      }

      setInternalValue(nextValue);
      setOpen(false);
      onChange?.({
        target: { value: nextValue },
        currentTarget: { value: nextValue },
      } as React.ChangeEvent<HTMLSelectElement>);
    }

    function moveSelection(direction: 1 | -1) {
      const enabledOptions = options.filter((option) => !option.disabled);
      if (!enabledOptions.length) {
        return;
      }

      const currentIndex = enabledOptions.findIndex(
        (option) => option.value === selectedValue,
      );
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + direction + enabledOptions.length) %
            enabledOptions.length;
      chooseOption(enabledOptions[nextIndex].value);
    }

    return (
      <span
        ref={wrapperRef}
        className={cn(
          "relative flex h-10 w-full min-w-0 items-center rounded-[8px] border border-[#dfe5ef] bg-[hsl(var(--field))] text-sm font-medium text-foreground shadow-none ring-0 transition-[background-color,border-color,box-shadow] focus-within:border-[#93b4f7] focus-within:ring-2 focus-within:ring-[#2563eb]/20 dark:border-[#263a55] dark:bg-[hsl(var(--field))]",
          open && "z-[80]",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <select
          {...props}
          ref={selectRef}
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
          disabled={disabled}
          value={selectedValue}
          id={`${triggerId}-native`}
          name={name}
          required={required}
          onChange={onChange ?? (() => {})}
        >
          {children}
        </select>
        <button
          type="button"
          id={triggerId}
          className="flex h-full w-full min-w-0 items-center justify-between gap-2 rounded-[inherit] px-3 text-left text-inherit outline-none disabled:cursor-not-allowed"
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
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (open) {
                moveSelection(1);
              } else {
                updateMenuPosition();
                setOpen(true);
              }
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              if (open) {
                moveSelection(-1);
              } else {
                updateMenuPosition();
                setOpen(true);
              }
            }
          }}
        >
          <span className="min-w-0 flex-1 truncate">
            {selectedOption?.label ?? ""}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-[#667085] transition-transform dark:text-muted-foreground",
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
                className="fixed z-[1000] overflow-y-auto rounded-[8px] border border-[#dfe5ef] bg-white p-1.5 text-sm shadow-[var(--surface-shadow-strong)] dark:border-[#263a55] dark:bg-[#0f1b2a]"
                style={{
                  left: menuPosition?.left ?? 0,
                  top: menuPosition?.top ?? 0,
                  width: menuPosition?.width,
                  maxHeight: menuPosition?.maxHeight,
                  visibility: menuPosition ? "visible" : "hidden",
                }}
              >
                {options.map((option) => {
                  const selected = option.value === selectedValue;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={option.disabled}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-[7px] px-2.5 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:cursor-not-allowed disabled:opacity-45",
                        selected
                          ? "bg-[#eff6ff] text-[#1d4ed8] dark:bg-blue-400/10 dark:text-blue-100"
                          : "text-[#344054] hover:bg-[#f6f8fb] dark:text-foreground dark:hover:bg-white/[0.055]",
                      )}
                      onClick={() => chooseOption(option.value)}
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
      </span>
    );
  },
);
Select.displayName = "Select";
