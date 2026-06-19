"use client";

import type {
  ElementType,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Mail,
  MessageSquare,
  PenLine,
  Search,
  TriangleAlert,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn, titleCase } from "@/lib/utils";

export type ReportStatusVariant =
  | "Draft"
  | "Missing"
  | "Published"
  | "Submitted";

type ReportSurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  padded?: boolean;
};

type ReportPageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  actionsClassName?: string;
};

type ReportSearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value"
> & {
  value: string;
  onValueChange: (value: string) => void;
  inputClassName?: string;
};

type ReportActivitySourceIconProps = {
  source?: string | null;
  className?: string;
  size?: "sm" | "md";
};

type ReportStatusBadgeProps = {
  status: ReportStatusVariant | string;
  className?: string;
  showIcon?: boolean;
};

const activitySourceIconSizeClassNames = {
  sm: "h-8 w-8 rounded-[7px] [&_svg]:h-3.5 [&_svg]:w-3.5",
  md: "h-9 w-9 rounded-[8px] [&_svg]:h-4 [&_svg]:w-4",
};

function activitySourceIconTone(source?: string | null) {
  if (source === "JIRA") {
    return "bg-[#2563eb] text-white";
  }

  if (source === "GOOGLE_CALENDAR") {
    return "bg-[#facc15] text-[#2563eb]";
  }

  if (source === "GOOGLE_TASKS") {
    return "bg-white text-[#2563eb] ring-1 ring-[#2563eb] dark:bg-[#0b1523]";
  }

  if (source === "GMAIL") {
    return "bg-white text-[#b42318] ring-1 ring-[#f4b9b0] dark:bg-[#0b1523] dark:text-[#fca5a5] dark:ring-red-300/25";
  }

  if (source === "GOOGLE_CHAT") {
    return "bg-white text-[#0f9d58] ring-1 ring-[#b7e4cf] dark:bg-[#0b1523] dark:text-[#86efac] dark:ring-emerald-300/25";
  }

  if (source === "MANUAL") {
    return "bg-white text-[#2563eb] ring-1 ring-[#2563eb] dark:bg-[#0b1523]";
  }

  return "bg-white text-[#8b5cf6] ring-1 ring-[#d8b4fe] dark:bg-[#0b1523] dark:ring-purple-300/25";
}

function activitySourceIcon(source?: string | null) {
  if (source === "JIRA") {
    return <FileText aria-hidden="true" />;
  }

  if (source === "GOOGLE_CALENDAR") {
    return <CalendarDays aria-hidden="true" />;
  }

  if (source === "GOOGLE_TASKS") {
    return <CheckCircle2 aria-hidden="true" />;
  }

  if (source === "GMAIL") {
    return <Mail aria-hidden="true" />;
  }

  if (source === "GOOGLE_CHAT") {
    return <MessageSquare aria-hidden="true" />;
  }

  if (source === "MANUAL") {
    return <PenLine aria-hidden="true" />;
  }

  return <MessageSquare aria-hidden="true" />;
}

function statusTextTone(status: string) {
  if (status === "Submitted" || status === "Published") {
    return "text-emerald-700 dark:text-emerald-300";
  }

  if (status === "Missing") {
    return "text-red-700 dark:text-red-300";
  }

  return "text-[#475569] dark:text-[#b5c2d3]";
}

function statusDotTone(status: string) {
  if (status === "Submitted" || status === "Published") {
    return "bg-emerald-500 dark:bg-emerald-300";
  }

  if (status === "Missing") {
    return "bg-red-500 dark:bg-red-300";
  }

  return "bg-[#94a3b8] dark:bg-[#b5c2d3]";
}

function statusIcon(status: string) {
  if (status === "Submitted" || status === "Published") {
    return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  }

  if (status === "Missing") {
    return <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />;
  }

  return <PenLine className="h-3.5 w-3.5" aria-hidden="true" />;
}

export function formatReportDuration(minutes?: number | null) {
  if (!minutes) {
    return "-";
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (!hours) {
    return `${remaining}m`;
  }

  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

export function reportActivitySourceLabel(source?: string | null) {
  if (source === "GOOGLE_CALENDAR") {
    return "Google Calendar";
  }

  if (source === "GOOGLE_TASKS") {
    return "Google Tasks";
  }

  if (source === "GMAIL") {
    return "Gmail";
  }

  if (source === "GOOGLE_CHAT") {
    return "Google Chat";
  }

  if (source === "JIRA") {
    return "Jira";
  }

  if (source === "MANUAL") {
    return "Manual";
  }

  return source ? titleCase(source) : "Unknown";
}

export function ReportActivitySourceIcon({
  source,
  className,
  size = "sm",
}: ReportActivitySourceIconProps) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        activitySourceIconSizeClassNames[size],
        activitySourceIconTone(source),
        className,
      )}
    >
      {activitySourceIcon(source)}
    </span>
  );
}

export function ReportPageHeader({
  title,
  description,
  actions,
  className,
  actionsClassName,
}: ReportPageHeaderProps) {
  return (
    <div className={cn("reference-page-header", className)}>
      <div>
        <h1 className="reference-title">{title}</h1>
        {description ? (
          <p className="mt-0.5 text-xs leading-5 text-[#667085] dark:text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div
          className={cn("flex flex-wrap items-center gap-2", actionsClassName)}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function ReportSearchField({
  value,
  onValueChange,
  className,
  inputClassName,
  ...props
}: ReportSearchFieldProps) {
  return (
    <label
      className={cn(
        "relative flex h-9 min-w-0 items-center rounded-[8px] border border-[#dfe5ef] bg-white text-sm shadow-none transition-[border-color,box-shadow] focus-within:border-[#93b4f7] focus-within:ring-2 focus-within:ring-[#2563eb]/20 dark:border-[#263a55] dark:bg-[#0b1523]",
        className,
      )}
    >
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[#667085]" />
      <Input
        {...props}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          "h-8 min-w-0 border-0 bg-transparent pl-9 pr-3 text-sm font-medium text-[#111827] shadow-none placeholder:text-[#98a2b3] focus-visible:ring-0 dark:bg-transparent dark:text-foreground",
          inputClassName,
        )}
      />
    </label>
  );
}

export function ReportStatusBadge({
  status,
  className,
  showIcon = false,
}: ReportStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold",
        statusTextTone(status),
        className,
      )}
    >
      {showIcon ? (
        statusIcon(status)
      ) : (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", statusDotTone(status))}
          aria-hidden="true"
        />
      )}
      {status}
    </span>
  );
}

export function ReportSurface({
  as: Component = "section",
  padded = true,
  className,
  ...props
}: ReportSurfaceProps) {
  return (
    <Component
      className={cn("reference-card", padded && "p-3", className)}
      {...props}
    />
  );
}
