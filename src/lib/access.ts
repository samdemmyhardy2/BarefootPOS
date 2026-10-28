import type { User } from "./types";

export type JobPermission = "ORDER_CREATE" | "ORDER_VIEW" | "ORDER_SERVE" | "KITCHEN" | "BAR" | "TABLES" | "ROOM_VIEW" | "ROOM_MANAGE" | "ROOM_FOLIO" | "TASK_ASSIGN" | "REPORTS";

const access: Record<JobPermission, string[]> = {
  ORDER_CREATE: ["waiter", "guestwelcomer", "bungalowmanager"],
  ORDER_VIEW: ["waiter", "chef", "bartender", "barista", "barman"],
  ORDER_SERVE: ["waiter"],
  KITCHEN: ["chef"],
  BAR: ["bartender", "barista", "barman"],
  TABLES: ["waiter"],
  ROOM_VIEW: ["bungalowmanager", "guestwelcomer", "chiefaccountant", "cashier"],
  ROOM_MANAGE: ["bungalowmanager", "guestwelcomer"],
  ROOM_FOLIO: ["bungalowmanager", "guestwelcomer", "chiefaccountant", "cashier"],
  TASK_ASSIGN: ["chef", "bungalowmanager"],
  REPORTS: ["chiefaccountant", "bungalowmanager"],
};

export function hasJobPermission(user: User | null | undefined, permission: JobPermission): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  const jobTitle = (user.jobTitle || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  return access[permission].includes(jobTitle);
}

export function canUseTasks(user: User | null | undefined): boolean {
  return user?.role === "ADMIN" || Boolean(user);
}
