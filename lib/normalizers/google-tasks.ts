import type { tasks_v1 } from "googleapis";

import type { NormalizedActivity } from "@/lib/normalizers/types";

export function normalizeGoogleTask(
  task: tasks_v1.Schema$Task,
  taskListId: string,
  taskListTitle: string
): NormalizedActivity | null {
  if (!task.id || task.deleted) {
    return null;
  }

  const completedAt = task.completed ? new Date(task.completed) : null;
  const updatedAt = task.updated ? new Date(task.updated) : null;
  const dueAt = task.due ? new Date(`${task.due.slice(0, 10)}T12:00:00.000Z`) : null;
  const activityAt = completedAt ?? dueAt ?? updatedAt;
  const assignmentInfo = task.assignmentInfo;
  const spaceInfo = assignmentInfo?.spaceInfo;
  const sourceUrl = assignmentInfo?.linkToTask ?? task.webViewLink ?? null;

  return {
    source: "GOOGLE_TASKS",
    sourceId: task.id,
    sourceContainerId: taskListId,
    title: task.title ?? "Untitled task",
    description: task.notes ?? null,
    status: task.status ?? null,
    sourceUrl,
    startedAt: activityAt,
    endedAt: completedAt ?? activityAt,
    metadata: {
      taskListTitle,
      due: task.due,
      completed: task.completed,
      hidden: task.hidden,
      position: task.position,
      assignmentSurface: assignmentInfo?.surfaceType,
      assignmentSpace: spaceInfo?.space
    }
  };
}
