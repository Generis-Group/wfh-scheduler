import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type SelectOption = {
  value: string;
  label: string;
  disabled: boolean;
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
    if (!React.isValidElement<React.OptionHTMLAttributes<HTMLOptionElement>>(child)) {
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

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(
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
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const selectRef = React.useRef<HTMLSelectElement>(null);
    const wrapperRef = React.useRef<HTMLSpanElement>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);
    const options = React.useMemo(() => selectOptions(children), [children]);
    const [open, setOpen] = React.useState(false);
    const [menuRect, setMenuRect] = React.useState<{
      left: number;
      maxHeight: number;
      top: number;
      width: number;
    } | null>(null);
    const [internalValue, setInternalValue] = React.useState(() =>
      selectValue(defaultValue ?? options[0]?.value ?? ""),
    );
    const selectedValue =
      value !== undefined ? selectValue(value) : internalValue;
    const selectedOption =
      options.find((option) => option.value === selectedValue) ?? options[0];
    const triggerId = id ?? `select-${generatedId}`;
    const listboxId = `${triggerId}-listbox`;

    React.useImperativeHandle(ref, () => selectRef.current as HTMLSelectElement);

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
          Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding),
        ),
        maxHeight: Math.min(256, availableHeight),
        top: openBelow
          ? rect.bottom + gap
          : Math.max(viewportPadding, rect.top - gap - Math.min(256, availableHeight)),
        width: rect.width,
      });
    }, []);

    React.useEffect(() => {
      if (!open) {
        setMenuRect(null);
        return;
      }

      updateMenuPosition();

      function handlePointerDown(event: PointerEvent) {
        const target = event.target as Node;

        if (
          !wrapperRef.current?.contains(target) &&
          !menuRef.current?.contains(target)
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
          "relative flex h-10 w-full min-w-0 items-center rounded-[8px] bg-white text-sm font-medium text-[#111827] shadow-none ring-1 ring-[#dfe4ee] transition-colors focus-within:ring-2 focus-within:ring-[#2563eb] dark:bg-[#0b1523] dark:text-foreground dark:ring-[#263a55]",
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
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              open ? moveSelection(1) : setOpen(true);
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              open ? moveSelection(-1) : setOpen(true);
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
        {open && menuRect && typeof document !== "undefined"
          ? createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={triggerId}
            className="fixed z-50 min-w-[12rem] overflow-y-auto rounded-[8px] bg-white p-1.5 text-sm shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#dfe4ee] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
            style={{
              left: menuRect.left,
              maxHeight: menuRect.maxHeight,
              top: menuRect.top,
              width: menuRect.width,
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
                      : "text-[#344054] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5",
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
