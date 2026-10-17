import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, ClipboardList, Plus, Trash2 } from "lucide-react";
import { Field, Modal, PageHeader, Panel, SelectField } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import type { StaffTask, TaskStatus, User } from "../lib/types";
import { useAuthStore } from "../stores/authStore";
import { useUiStore } from "../stores/uiStore";
import { hasJobPermission } from "../lib/access";

const dueLabel = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "No due date";

export function TasksPage() {
  const user = useAuthStore((state) => state.user)!;
  const assignPermission = hasJobPermission(user, "TASK_ASSIGN");
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToIds, setAssignedToIds] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notify = useUiStore((state) => state.notify);

  const load = useCallback(async () => {
    try {
      const response = await api.get<StaffTask[]>("/tasks");
      setTasks(response.data);
      if (assignPermission) {
        const staff = await api.get<User[]>("/tasks/assignees");
        setEmployees(staff.data);
      }
    } catch (cause) { setError(errorMessage(cause)); }
  }, [assignPermission]);
  useEffect(() => { void load(); }, [load]);

  const createTask = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api.post("/tasks", { title, description: description || undefined, assignedToIds, dueAt: dueAt ? new Date(dueAt).toISOString() : undefined });
      setModal(false); setTitle(""); setDescription(""); setAssignedToIds([]); setDueAt("");
      notify("Task assigned successfully."); await load();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const updateStatus = async (task: StaffTask, status: TaskStatus) => {
    try {
      const { data } = await api.patch<StaffTask>(`/tasks/${task.id}/status`, { status });
      setTasks((current) => current.map((item) => item.id === data.id ? data : item));
      notify("Task status updated.");
    } catch (cause) { setError(errorMessage(cause)); }
  };
  const remove = async (task: StaffTask) => {
    if (!window.confirm(`Delete task “${task.title}”?`)) return;
    try { await api.delete(`/tasks/${task.id}`); setTasks((current) => current.filter((item) => item.id !== task.id)); notify("Task deleted."); }
    catch (cause) { setError(errorMessage(cause)); }
  };

  const todo = tasks.filter((task) => task.status === "TODO").length;
  const inProgress = tasks.filter((task) => task.status === "IN_PROGRESS").length;
  const completed = tasks.filter((task) => task.status === "COMPLETED").length;
  return <div className="page-enter">
    <PageHeader eyebrow="Team workspace" title="Tasks" description={user.role === "ADMIN" ? "Create and assign work, then follow its progress." : "See the work assigned to you and keep its status up to date."} action={assignPermission ? <button onClick={() => setModal(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-olive px-4 text-xs font-bold text-white"><Plus size={15} /> Assign task</button> : undefined} />
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <div className="mb-5 grid grid-cols-3 gap-3">
      <Panel className="p-4"><p className="font-display text-2xl font-bold">{todo}</p><p className="text-xs text-muted">To do</p></Panel>
      <Panel className="p-4"><p className="font-display text-2xl font-bold">{inProgress}</p><p className="text-xs text-muted">In progress</p></Panel>
      <Panel className="p-4"><p className="font-display text-2xl font-bold">{completed}</p><p className="text-xs text-muted">Completed</p></Panel>
    </div>
    {tasks.length ? <div className="grid gap-3 lg:grid-cols-2">{tasks.map((task) => <Panel key={task.id} className="p-4 sm:p-5">
      <div className="flex items-start gap-3"><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${task.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-olive-soft text-olive"}`}><ClipboardList size={17} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-sm font-bold">{task.title}</h2>{user.role === "ADMIN" && <button onClick={() => void remove(task)} aria-label="Delete task" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>}</div>
        {task.description && <p className="mt-1 text-xs leading-5 text-muted">{task.description}</p>}
        <p className="mt-2 text-[11px] text-muted">Assigned to <span className="font-semibold text-ink">{task.assignments.map(({ employee }) => employee.name).join(", ")}</span></p>
        <p className="mt-1 text-[11px] text-muted">Due: {dueLabel(task.dueAt)}</p>
        <div className="mt-4 flex items-center justify-between gap-3"><span className="text-[10px] text-muted">Assigned by {task.createdBy?.name ?? "Former employee"}</span><SelectField label="Task status" value={task.status} onChange={(event) => void updateStatus(task, event.target.value as TaskStatus)} className="w-[145px]"><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option></SelectField></div>
      </div>{task.status === "COMPLETED" && <Check className="sr-only" />}</div>
    </Panel>)}</div> : <Panel className="p-12 text-center"><ClipboardList className="mx-auto text-muted" /><p className="mt-3 font-semibold">No tasks assigned</p><p className="mt-1 text-sm text-muted">{assignPermission ? "Assign a task to get the team started." : "Tasks assigned to you will appear here."}</p></Panel>}
    {modal && <Modal title="Assign a task" onClose={() => setModal(false)}><form onSubmit={(event) => void createTask(event)} className="space-y-4"><Field label="Task title" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Prepare dining room for dinner" /><label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink">Instructions (optional)</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none focus:border-olive" /></label><fieldset className="block"><legend className="mb-1.5 text-xs font-semibold text-ink">Assign to (select one or more employees)</legend><div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-line p-2">{employees.map((employee) => <label key={employee.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-canvas"><input type="checkbox" checked={assignedToIds.includes(employee.id)} onChange={(event) => setAssignedToIds((ids) => event.target.checked ? [...ids, employee.id] : ids.filter((id) => id !== employee.id))} className="accent-olive" /><span>{employee.name} <span className="text-muted">· {employee.jobTitle}</span></span></label>)}</div></fieldset><Field label="Due date (optional)" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /><button disabled={busy || assignedToIds.length === 0} className="h-11 w-full rounded-xl bg-olive text-sm font-bold text-white disabled:opacity-50">{busy ? "Assigning…" : "Assign task"}</button></form></Modal>}
  </div>;
}
