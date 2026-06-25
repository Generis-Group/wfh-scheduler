"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink } from "lucide-react";

import { useDismissableLayer } from "@/components/ui/use-dismissable-layer";
import { anchoredFixedPlacement } from "@/lib/anchored-position";
import {
  activitySourceLinkOptions,
  type ActivitySourceLink,
} from "@/lib/activity-source-links";
import { cn } from "@/lib/utils";

type ActivitySourceLinkPickerProps = {
  source?: string | null;
  sourceUrl?: string | null;
  sourceLinks?: Array<Partial<ActivitySourceLink> | null | undefined> | null;
  children: ReactNode;
  className?: string;
  plainClassName?: string;
  menuLabel?: string;
};

type MenuPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

export function ActivitySourceLinkPicker({
  source,
  sourceUrl,
  sourceLinks,
  children,
  className,
  plainClassName,
  menuLabel = "Choose source link",
}: ActivitySourceLinkPickerProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const links = useMemo(
    () => activitySourceLinkOptions({ source, sourceUrl, sourceLinks }),
    [source, sourceLinks, sourceUrl],
  );

  const updateMenuPosition = useCallback(() => {
    if (typeof window === "undefined" || !triggerRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const placement = anchoredFixedPlacement({
      anchorRect: rect,
      preferredWidth: 280,
      preferredMaxHeight: 280,
      minHeight: 144,
      flipHeight: 180,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      viewportPadding: 8,
      gap: 6,
      align: "start",
    });

    setPosition({
      left: placement.left,
      top: placement.top,
      width: placement.width,
      maxHeight: placement.maxHeight,
    });
  }, []);

  useDismissableLayer({
    open,
    refs: [triggerRef, menuRef],
    onDismiss: () => setOpen(false),
  });

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  if (links.length === 0) {
    return <span className={plainClassName}>{children}</span>;
  }

  if (links.length === 1) {
    return (
      <a
        href={links[0].href}
        target="_blank"
        rel="noreferrer"
        draggable={false}
        className={className}
      >
        {children}
      </a>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn("text-left", className)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel}
        onClick={() => setOpen((current) => !current)}
      >
        {children}
      </button>
      {open && position && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[70] overflow-y-auto overscroll-contain rounded-[10px] bg-white p-1.5 text-sm shadow-[0_18px_42px_rgba(15,23,42,0.18)] ring-1 ring-[#dbe3ee] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
              style={{
                left: position.left,
                top: position.top,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
            >
              {links.map((link) => (
                <a
                  key={link.href}
                  role="menuitem"
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 items-center gap-2 rounded-[8px] px-3 py-2 text-left font-medium text-[#334155] transition-colors hover:bg-[#eef4ff] hover:text-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:text-foreground dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
                  onClick={() => setOpen(false)}
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">{link.label}</span>
                </a>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
