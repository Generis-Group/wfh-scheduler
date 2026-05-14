"use client";

import { useState } from "react";
import { CalendarDays, KanbanSquare, Save } from "lucide-react";
import { signIn } from "next-auth/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { OAuthProviderConfig } from "@/lib/oauth-config";

type Settings = {
  jiraCloudId?: string | null;
  googleCalendarId: string;
  googleTaskListIds: string[];
};

type JiraResource = {
  id: string;
  name: string;
  url: string;
};

type TaskList = {
  id: string;
  title: string;
};

export function SettingsPanel({
  connected,
  oauthConfig,
  initialSettings,
  jiraResources,
  taskLists
}: {
  connected: {
    google: boolean;
    atlassian: boolean;
  };
  oauthConfig: OAuthProviderConfig;
  initialSettings: Settings;
  jiraResources: JiraResource[];
  taskLists: TaskList[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState<string | null>(null);

  function toggleTaskList(id: string, checked: boolean) {
    setSettings((current) => ({
      ...current,
      googleTaskListIds: checked
        ? [...new Set([...current.googleTaskListIds, id])]
        : current.googleTaskListIds.filter((item) => item !== id)
    }));
  }

  async function save() {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });

    setMessage(response.ok ? "Settings saved." : "Unable to save settings.");
  }

  async function disconnect(provider: "google" | "atlassian") {
    const response = await fetch(`/api/settings/providers/${provider}`, { method: "DELETE" });

    if (response.ok) {
      window.location.reload();
      return;
    }

    setMessage(`Unable to disconnect ${provider}.`);
  }

  return (
    <div className="page-shell">
      <div>
        <p className="text-sm font-medium text-primary">Settings</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal">Integrations</h1>
        <p className="mt-2 text-sm text-muted-foreground">Connect read-only Jira, Google Calendar, and Google Tasks access.</p>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Atlassian Jira</CardTitle>
                <CardDescription>Imports issues, worklogs, and changelogs as normalized report activity.</CardDescription>
              </div>
              <Badge variant={connected.atlassian ? "default" : "secondary"}>
                {connected.atlassian ? "Connected" : "Not connected"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!oauthConfig.atlassian}
                title={oauthConfig.atlassian ? "Connect Atlassian" : "Atlassian OAuth is not configured"}
                onClick={() => signIn("atlassian", { callbackUrl: "/settings" })}
              >
                <KanbanSquare className="mr-2 h-4 w-4" />
                Connect Atlassian
              </Button>
              {connected.atlassian ? (
                <Button variant="ghost" onClick={() => disconnect("atlassian")}>
                  Disconnect
                </Button>
              ) : null}
            </div>
            {!oauthConfig.atlassian ? (
              <p className="text-sm text-muted-foreground">
                Add `ATLASSIAN_CLIENT_ID` and `ATLASSIAN_CLIENT_SECRET` to `.env.local` to enable this connection.
              </p>
            ) : null}
            <div className="space-y-2">
              <Label>Jira cloud site</Label>
              <Select
                value={settings.jiraCloudId ?? ""}
                onChange={(event) => setSettings((current) => ({ ...current, jiraCloudId: event.target.value || null }))}
                disabled={!connected.atlassian || jiraResources.length === 0}
              >
                <option value="">Auto-select first available site</option>
                {jiraResources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Google Workspace</CardTitle>
                <CardDescription>Imports Calendar meetings and selected Google Tasks lists.</CardDescription>
              </div>
              <Badge variant={connected.google ? "default" : "secondary"}>{connected.google ? "Connected" : "Not connected"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!oauthConfig.google}
                title={oauthConfig.google ? "Connect Google" : "Google OAuth is not configured"}
                onClick={() => signIn("google", { callbackUrl: "/settings" })}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                Connect Google
              </Button>
              {connected.google ? (
                <Button variant="ghost" onClick={() => disconnect("google")}>
                  Disconnect
                </Button>
              ) : null}
            </div>
            {!oauthConfig.google ? (
              <p className="text-sm text-muted-foreground">
                Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env.local` to enable this connection.
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="calendarId">Calendar ID</Label>
              <Input
                id="calendarId"
                value={settings.googleCalendarId}
                onChange={(event) => setSettings((current) => ({ ...current, googleCalendarId: event.target.value || "primary" }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Task lists</Label>
              <div className="space-y-2 rounded-md border bg-white p-3">
                {taskLists.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Connect Google to load task lists. Empty selection imports all lists.</p>
                ) : (
                  taskLists.map((list) => (
                    <label key={list.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={settings.googleTaskListIds.includes(list.id)}
                        onChange={(event) => toggleTaskList(list.id, event.target.checked)}
                      />
                      {list.title}
                    </label>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <Button onClick={save}>
          <Save className="mr-2 h-4 w-4" />
          Save settings
        </Button>
      </div>
    </div>
  );
}
