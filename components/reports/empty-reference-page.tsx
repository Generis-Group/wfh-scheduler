"use client";

import { Construction } from "lucide-react";

import { EmptyReferenceState, ReferenceAppShell, ReferencePanel } from "@/components/reports/reference-shell";

export function EmptyReferencePage({
  active,
  variant,
  title,
  description,
  userName,
  userRole,
  preview = false
}: {
  active: string;
  variant: "employee" | "admin";
  title: string;
  description: string;
  userName?: string | null;
  userRole?: string | null;
  preview?: boolean;
}) {
  return (
    <ReferenceAppShell active={active} variant={variant} userName={userName} userRole={userRole} preview={preview}>
      <main className="w-full px-[clamp(16px,2vw,34px)] pb-8 pt-8">
        <div className="mb-5">
          <h1 className="text-[26px] font-semibold tracking-normal text-[#0f172a]">{title}</h1>
          <p className="mt-2 text-sm text-[#64748b]">{description}</p>
        </div>
        <ReferencePanel className="p-8">
          <EmptyReferenceState>
            <span className="flex items-center gap-2">
              <Construction className="h-5 w-5" />
              This page is ready to open, but its data and actions are not connected yet.
            </span>
          </EmptyReferenceState>
        </ReferencePanel>
      </main>
    </ReferenceAppShell>
  );
}
