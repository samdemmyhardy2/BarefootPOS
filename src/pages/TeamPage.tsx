import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { Field, Modal, PageHeader, Panel } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import type { Employee } from "../lib/types";
import { initials } from "../lib/types";
import { useUiStore } from "../stores/uiStore";

export function TeamPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [modal, setModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [jobTitle, setJobTitle] = useState("Waiter");
  const [error, setError] = useState("");
  const notify = useUiStore((state) => state.notify);
  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Employee[]>("/employees");
      setEmployees(data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const saveEmployee = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      if (editingEmployee) {
        await api.patch(`/employees/${editingEmployee.id}`, {
          name,
          email,
          jobTitle,
          ...(password ? { password } : {}),
        });
        notify("Team member updated.");
      } else {
        await api.post("/employees", { name, email, password, jobTitle });
        notify("Team member added.");
      }
      setModal(false);
      setEditingEmployee(null);
      setName("");
      setEmail("");
      setPassword("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const openCreate = () => {
    setEditingEmployee(null);
    setName("");
    setEmail("");
    setPassword("");
    setJobTitle("Waiter");
    setModal(true);
  };
  const openEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setName(employee.name);
    setEmail(employee.email);
    setPassword("");
    setJobTitle(employee.jobTitle ?? "Waiter");
    setModal(true);
  };
  const remove = async (employee: Employee) => {
    if (!window.confirm(`Remove ${employee.name} from the team?`)) return;
    try {
      await api.delete(`/employees/${employee.id}`);
      setEmployees((current) =>
        current.filter((item) => item.id !== employee.id),
      );
      notify("Team member removed.");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const visible = employees.filter((person) =>
    `${person.name} ${person.email}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Admin · People"
        title="Your team"
        description="The people who make every service feel special."
        action={
          <button
            onClick={openCreate}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-olive px-4 text-xs font-bold text-white hover:bg-[#334438]"
          >
            <Plus size={15} /> Add employee
          </button>
        }
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Panel className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf2e9] text-olive">
            <Users size={18} />
          </span>
          <div>
            <p className="font-display text-xl font-bold">{employees.length}</p>
            <p className="text-[11px] text-muted">Team members</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <div>
            <p className="font-display text-xl font-bold">
              {employees.filter((employee) => employee.isOnline).length}
            </p>
            <p className="text-[11px] text-muted">Online now</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f8edf2] text-[#a85e78]">
            <UserRound size={18} />
          </span>
          <div>
            <p className="font-display text-xl font-bold">
              {employees.filter((employee) => !employee.isOnline).length}
            </p>
            <p className="text-[11px] text-muted">Away</p>
          </div>
        </Panel>
      </div>
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line p-4">
          <div>
            <h2 className="font-display text-sm font-bold">
              Restaurant employees
            </h2>
            <p className="mt-1 text-[11px] text-muted">
              Account details and current presence
            </p>
          </div>
          <div className="relative w-48">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a teammate"
              className="h-9 w-full rounded-lg border border-line pl-9 pr-2 text-xs outline-none focus:border-olive"
            />
          </div>
        </div>
        {visible.length ? (
          <div className="divide-y divide-line">
            {visible.map((employee, index) => (
              <div
                key={employee.id}
                className="flex items-center gap-3 px-4 py-4 sm:px-5"
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold ${["bg-[#e8eee8] text-olive", "bg-[#f6e8dd] text-[#a66644]", "bg-[#ede8f6] text-[#735f9c]", "bg-[#f4e7ea] text-[#a85e78]"][index % 4]}`}
                >
                  {initials(employee.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{employee.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-[10px] text-muted">
                    <Mail size={11} />
                    {employee.email}
                  </p>
                </div>
                <span className="hidden rounded-full bg-canvas px-2.5 py-1 text-[10px] font-semibold text-muted sm:inline">
                  {employee.jobTitle || "Employee"}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${employee.isOnline ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${employee.isOnline ? "bg-emerald-500" : "bg-stone-400"}`}
                  />
                  {employee.isOnline ? "Online" : "Away"}
                </span>
                <button
                  onClick={() => openEdit(employee)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
                  title="Edit employee"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => void remove(employee)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600"
                  title="Remove employee"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <Users className="mx-auto text-muted" />
            <p className="mt-3 text-sm font-semibold">No teammates found</p>
            <p className="mt-1 text-xs text-muted">
              Add an employee or change your search.
            </p>
          </div>
        )}
      </Panel>
      {modal && (
        <Modal
          title={
            editingEmployee ? "Update team member" : "Invite a team member"
          }
          onClose={() => setModal(false)}
        >
          <form
            onSubmit={(event) => void saveEmployee(event)}
            className="space-y-4"
          >
            <p className="-mt-2 text-xs leading-5 text-muted">
              {editingEmployee
                ? "Update this employee’s account details. Leave the password blank to keep it as is."
                : "Their account will be ready as soon as you save it. They can sign in with these details."}
            </p>
            <Field
              label="Full name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morgan Lee"
            />
            <Field
              label="Work email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="morgan@restaurant.com"
            />
            <div>
              <Field label="Restaurant position" list="restaurant-job-titles" required value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Waiter, Chef, or Accountant" />
              <datalist id="restaurant-job-titles">
                {["Waiter", "Chef", "Chief Accountant", "Bungalow Manager", "Guest Welcomer", "Gardener", "Cashier", "Housekeeping"].map((title) => <option key={title} value={title} />)}
              </datalist>
              <p className="mt-1 text-[11px] text-muted">Choose a suggestion or enter another position.</p>
            </div>
            <Field
              label={
                editingEmployee
                  ? "New password (optional)"
                  : "Temporary password"
              }
              type="password"
              required={!editingEmployee}
              minLength={editingEmployee && !password ? undefined : 8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                editingEmployee
                  ? "Leave blank to keep current password"
                  : "At least 8 characters"
              }
            />
            <button className="h-11 w-full rounded-xl bg-olive text-sm font-bold text-white hover:bg-[#334438]">
              {editingEmployee ? "Save changes" : "Create employee account"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
