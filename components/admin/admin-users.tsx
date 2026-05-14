"use client";

import { useState } from "react";
import { KeyRound, Save, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type User = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: "EMPLOYEE" | "REVIEWER" | "ADMIN";
  status: "INVITED" | "ACTIVE" | "DISABLED";
  timezone: string;
};

type CompanySettings = {
  emailDomains: string[];
  jiraProjectKeys: string[];
};

export function AdminUsers({
  initialUsers,
  initialSettings
}: {
  initialUsers: User[];
  initialSettings: CompanySettings;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [settings, setSettings] = useState(initialSettings);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<User["role"]>("EMPLOYEE");
  const [message, setMessage] = useState<string | null>(null);

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role, status: "ACTIVE" })
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error ?? "Unable to create user.");
      return;
    }

    setUsers((current) => [...current, data.user]);
    setName("");
    setEmail("");
    setRole("EMPLOYEE");
    setMessage(`Temporary password: ${data.temporaryPassword}`);
  }

  async function updateUser(user: User, patch: Partial<User>) {
    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    setUsers((current) => current.map((item) => (item.id === user.id ? data.user : item)));
  }

  async function resetPassword(user: User) {
    const response = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: "POST" });
    const data = await response.json();

    if (response.ok) {
      setMessage(`${user.email} temporary password: ${data.temporaryPassword}`);
    }
  }

  async function saveSettings() {
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });

    if (response.ok) {
      setMessage("Company settings saved.");
    }
  }

  return (
    <div className="page-shell">
      <div>
        <p className="text-sm font-medium text-primary">Administration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal">Users and company settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Invite-only access, fallback credentials, domains, and Jira filters.</p>
      </div>

      {message ? <Card className="border-primary/40 bg-primary/5"><CardContent className="p-4 text-sm">{message}</CardContent></Card> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Team members</CardTitle>
            <CardDescription>Assign roles and disable access without deleting reporting history.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Password</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.name ?? "-"}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Select value={user.role} onChange={(event) => updateUser(user, { role: event.target.value as User["role"] })}>
                        <option value="EMPLOYEE">Employee</option>
                        <option value="REVIEWER">Reviewer</option>
                        <option value="ADMIN">Admin</option>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.status}
                        onChange={(event) => updateUser(user, { status: event.target.value as User["status"] })}
                      >
                        <option value="INVITED">Invited</option>
                        <option value="ACTIVE">Active</option>
                        <option value="DISABLED">Disabled</option>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => resetPassword(user)}>
                        <KeyRound className="mr-2 h-4 w-4" />
                        Reset
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Create user</CardTitle>
              <CardDescription>Creates an active credentials account with a temporary password.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={createUser}>
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select id="role" value={role} onChange={(event) => setRole(event.target.value as User["role"])}>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="REVIEWER">Reviewer</option>
                    <option value="ADMIN">Admin</option>
                  </Select>
                </div>
                <Button className="w-full">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Company settings</CardTitle>
              <CardDescription>Comma-separated domains and Jira project keys.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email domains</Label>
                <Input
                  value={settings.emailDomains.join(", ")}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      emailDomains: event.target.value.split(",").map((item) => item.trim()).filter(Boolean)
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Jira projects</Label>
                <Input
                  value={settings.jiraProjectKeys.join(", ")}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      jiraProjectKeys: event.target.value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean)
                    }))
                  }
                />
              </div>
              <Button variant="secondary" className="w-full" onClick={saveSettings}>
                <Save className="mr-2 h-4 w-4" />
                Save settings
              </Button>
              <div className="flex flex-wrap gap-2">
                {settings.jiraProjectKeys.map((key) => (
                  <Badge key={key} variant="outline">{key}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
