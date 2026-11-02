import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Camera, Coffee, FileSpreadsheet, Pencil, Plus, Search, Salad, Trash2, Utensils, GripHorizontal, X } from "lucide-react";
import { Field, Modal, PageHeader, Panel } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import type { Category, MenuItem, ModifierGroup, PrepStation, SendTo } from "../lib/types";
import { MenuImportDialog } from "../components/MenuImportDialog";
import { readMenuWorkbook } from "../lib/menuWorkbook";
import { money } from "../lib/types";
import { useUiStore } from "../stores/uiStore";
import { ModifierGroupIcon, type ModifierGroupIconName } from "../components/ModifierGroupIcon";
import { ModifierGroupLivePreview } from "../components/ModifierGroupLivePreview";
import { mediaSrc } from "../lib/media";

const MENU_CACHE_KEY = "restaurant-menu-cache";
type MenuCache = { items: MenuItem[]; categories: Category[]; groups: ModifierGroup[] };
function readMenuCache(): MenuCache | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(MENU_CACHE_KEY) ?? "null") as MenuCache | null;
    if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.categories) || !Array.isArray(parsed.groups)) return null;
    return parsed;
  } catch {
    return null;
  }
}
function writeMenuCache(value: MenuCache) {
  try { localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(value)); } catch { /* The menu list still shows this visit. */ }
}

export function MenuPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const editorItemId = location.pathname.match(/^\/menu\/item-editor\/([^/]+)$/)?.[1];
  const groupEditorId = location.pathname.match(/^\/menu\/group-editor\/([^/]+)$/)?.[1];
  const cachedMenu = readMenuCache();
  const [categories, setCategories] = useState<Category[]>(cachedMenu?.categories ?? []);
  const [items, setItems] = useState<MenuItem[]>(cachedMenu?.items ?? []);
  const [itemsLoading, setItemsLoading] = useState(!cachedMenu);
  const [referencesLoading, setReferencesLoading] = useState(!cachedMenu);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>(cachedMenu?.groups ?? []);
  const [activeView, setActiveView] = useState<"dishes" | "groups">("dishes");
  const [groupCategoryFilter, setGroupCategoryFilter] = useState("All groups");
  const [categoryId, setCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [categoryModal, setCategoryModal] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [position, setPosition] = useState("0");
  const [description, setDescription] = useState("");
  const [itemPrepStation, setItemPrepStation] = useState<SendTo>("KITCHEN");
  const [importFile, setImportFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [groupModal, setGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupNameMy, setGroupNameMy] = useState("");
  const [groupNameTh, setGroupNameTh] = useState("");
  const [groupIcon, setGroupIcon] = useState<ModifierGroupIconName>("Utensils");
  const [groupMadeAt, setGroupMadeAt] = useState<"SAME_AS_DISH" | PrepStation>("SAME_AS_DISH");
  const [groupRequired, setGroupRequired] = useState(false);
  const [groupSelectionType, setGroupSelectionType] = useState<"SINGLE" | "MULTIPLE">("MULTIPLE");
  const [groupAppearance, setGroupAppearance] = useState<"RADIO" | "CHECKBOX" | "SLIDER" | "QUANTITY" | "TEXT" | "TOGGLE">("CHECKBOX");
  const [groupMin, setGroupMin] = useState("0");
  const [groupMax, setGroupMax] = useState("1");
  const [groupIncluded, setGroupIncluded] = useState("0");
  const [groupExtraPickPrice, setGroupExtraPickPrice] = useState("0");
  const [groupAllowDuplicates, setGroupAllowDuplicates] = useState(false);
  const [editingOptionIndex, setEditingOptionIndex] = useState<number | null>(null);
  const [groupOptions, setGroupOptions] = useState<Array<{ id?: string; name: string; nameMy: string; nameTh: string; priceAdjustment: string; defaultSelected: boolean; active: boolean; opensGroupId: string }>>([]);
  const [error, setError] = useState("");
  const notify = useUiStore((state) => state.notify);
  const itemRequestId = useRef(0);
  const hadMenuCache = useRef(Boolean(cachedMenu));
  const dishDialogRef = useRef<HTMLFormElement>(null);
  const groupDialogRef = useRef<HTMLFormElement>(null);
  const closeItemEditor = () => { setModal(false); setEditingItem(null); navigate("/menu"); };
  const closeGroupEditor = () => { setGroupModal(false); if (groupEditorId) navigate((location.state as { from?: string } | null)?.from || "/menu"); };
  const load = useCallback(async () => {
    const requestId = ++itemRequestId.current;
    if (!hadMenuCache.current) {
      setItemsLoading(true);
      setReferencesLoading(true);
    }
    try {
      const [{ data: categoryRows }, { data: groups }, { data: dishes }] = await Promise.all([
        api.get<Category[]>("/categories?includeItems=false"),
        api.get<ModifierGroup[]>("/modifier-groups"),
        api.get<MenuItem[]>("/menu-items"),
      ]);
      if (requestId !== itemRequestId.current) return;
      setCategories(categoryRows);
      setModifierGroups(groups);
      setItems(dishes);
      writeMenuCache({ items: dishes, categories: categoryRows, groups });
      hadMenuCache.current = true;
      setError("");
    } catch (e) {
      if (requestId === itemRequestId.current && !hadMenuCache.current) setError(errorMessage(e));
    } finally {
      if (requestId === itemRequestId.current) {
        setItemsLoading(false);
        setReferencesLoading(false);
      }
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!modal) return;
    const blurFields = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && dishDialogRef.current?.contains(active) && active !== dishDialogRef.current) active.blur();
      dishDialogRef.current?.focus({ preventScroll: true });
    };
    blurFields();
    const frame = window.requestAnimationFrame(blurFields);
    return () => window.cancelAnimationFrame(frame);
  }, [modal, editingItem?.id]);
  useEffect(() => {
    if (!groupModal) return;
    const blurFields = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && groupDialogRef.current?.contains(active) && active !== groupDialogRef.current) active.blur();
      groupDialogRef.current?.focus({ preventScroll: true });
    };
    blurFields();
    const frame = window.requestAnimationFrame(blurFields);
    return () => window.cancelAnimationFrame(frame);
  }, [groupModal, editingGroup?.id]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryId !== "all" && item.categoryId !== categoryId) return false;
      if (!query) return true;
      const options = (item.modifierGroups ?? []).map((link) => link.group.name).join(" ");
      return `${item.name} ${item.description ?? ""} ${item.category?.name ?? ""} ${options}`.toLowerCase().includes(query);
    });
  }, [items, categoryId, search]);
  const selectedCategoryName = categoryId === "all"
    ? "All dishes"
    : categories.find((category) => category.id === categoryId)?.name ?? "Menu";
  const shownGroups = useMemo(() => modifierGroups.filter((group) => (groupCategoryFilter === "All groups" || group.category === groupCategoryFilter) && `${group.name} ${group.category} ${group.options.map((option) => option.name).join(" ")}`.toLowerCase().includes(search.toLowerCase())), [modifierGroups, groupCategoryFilter, search]);
  const saveItem = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      let hostedImageUrl = imageUrl.trim();
      if (imageFile) {
        const form = new FormData();
        form.append("file", imageFile);
        const upload = await api.post<{ imageUrl: string }>("/media/images", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        hostedImageUrl = upload.data.imageUrl;
      }
      const payload = {
        name,
        price: Number(price),
        description,
        prepStation: itemPrepStation,
        categoryId: selectedCategory,
        position: Number(position),
        imageUrl: hostedImageUrl || (editingItem ? null : undefined),
        modifierGroupIds: selectedGroupIds,
      };
      if (editingItem) {
        await api.patch(`/menu-items/${editingItem.id}`, payload);
      } else {
        await api.post("/menu-items", payload);
      }
      notify(editingItem ? "Dish updated." : "Dish added to the menu.");
      setModal(false);
      setEditingItem(null);
      navigate("/menu");
      setName("");
      setPrice("");
      setPosition("0");
      setDescription("");
      setItemPrepStation("KITCHEN");
      setImageUrl("");
      setImageFile(null);
      setSelectedGroupIds([]);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    setName(item.name);
    setPrice(String(item.price));
    setPosition(String(item.position ?? 0));
    setDescription(item.description ?? "");
    setItemPrepStation(item.prepStation ?? "KITCHEN");
    setImageUrl(item.imageUrl ?? "");
    setImageFile(null);
    setSelectedCategory(item.categoryId);
    setSelectedGroupIds((item.modifierGroups ?? []).map((link) => link.group.id));
    setError("");
    setModal(true);
  };
  useEffect(() => {
    if (!editorItemId) return;
    if (editorItemId === "new") {
      setEditingItem(null);
      setSelectedCategory(categories[0]?.id ?? "");
      setName(""); setPrice(""); setPosition("0"); setDescription(""); setItemPrepStation("KITCHEN"); setImageUrl(""); setImageFile(null);
      setSelectedGroupIds([]); setModal(true);
      return;
    }
    const item = items.find((candidate) => candidate.id === editorItemId);
    if (item && editingItem?.id !== item.id) openEdit(item);
  }, [editorItemId, items]);
  const createCategory = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.post("/categories", { name });
      notify("Category created.");
      setCategoryModal(false);
      setName("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const removeItem = async (id: string) => {
    if (!window.confirm("Delete this dish from the menu? Past orders will still show it.")) return;
    try {
      await api.delete(`/menu-items/${id}`);
      setItems((current) => {
        const next = current.filter((item) => item.id !== id);
        writeMenuCache({ items: next, categories, groups: modifierGroups });
        return next;
      });
      notify("Dish removed.");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const openGroupEditor = (group?: ModifierGroup) => {
    setEditingGroup(group ?? null);
    setGroupName(group?.name ?? "");
    setGroupNameMy(group?.nameMy ?? "");
    setGroupNameTh(group?.nameTh ?? "");
    setGroupIcon((group?.icon as ModifierGroupIconName) ?? "Utensils");
    setGroupMadeAt(group?.madeAt ?? "SAME_AS_DISH");
    setGroupRequired(group?.required ?? false);
    setGroupSelectionType(group?.selectionType ?? "MULTIPLE");
    setGroupAppearance(group?.appearance ?? (group?.selectionType === "SINGLE" ? "RADIO" : group?.allowDuplicates ? "QUANTITY" : "CHECKBOX"));
    setGroupMin(String(group?.minPicks ?? 0));
    setGroupMax(String(group?.maxPicks ?? 1));
    setGroupIncluded(String(group?.includedPicks ?? 0));
    setGroupExtraPickPrice(String(group?.extraPickPrice ?? 0));
    setGroupAllowDuplicates(group?.allowDuplicates ?? false);
    setGroupOptions(group?.options.map((option) => ({ id: option.id, name: option.name, nameMy: option.nameMy, nameTh: option.nameTh, priceAdjustment: String(option.priceAdjustment), defaultSelected: option.defaultSelected, active: option.active, opensGroupId: option.opensGroupId ?? "" })) ?? [{ name: "", nameMy: "", nameTh: "", priceAdjustment: "0", defaultSelected: false, active: true, opensGroupId: "" }]);
    setEditingOptionIndex(group ? null : 0);
    setError("");
    setGroupModal(true);
  };
  const saveGroup = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      name: groupName.trim(), nameMy: groupNameMy.trim(), nameTh: groupNameTh.trim(), category: editingGroup?.category ?? "General", icon: groupIcon, appearance: groupAppearance, madeAt: groupMadeAt,
      required: groupAppearance === "TOGGLE" ? false : groupRequired, selectionType: groupAppearance === "TOGGLE" ? "MULTIPLE" : groupSelectionType, minPicks: groupAppearance === "TOGGLE" ? 0 : Number(groupMin), maxPicks: groupAppearance === "TOGGLE" ? Math.max(groupOptions.filter((option) => option.name.trim()).length, 1) : Number(groupMax),
      includedPicks: Number(groupIncluded), extraPickPrice: Number(groupExtraPickPrice || 0), allowDuplicates: groupAllowDuplicates,
      options: groupOptions.filter((option) => option.name.trim()).map((option, position) => ({
        name: option.name.trim(), nameMy: option.nameMy.trim(), nameTh: option.nameTh.trim(), priceAdjustment: Number(option.priceAdjustment || 0),
        defaultSelected: option.defaultSelected, active: option.active, position, ...(option.opensGroupId ? { opensGroupId: option.opensGroupId } : {}),
      })),
    };
    try {
      if (editingGroup) await api.patch(`/modifier-groups/${editingGroup.id}`, payload);
      else {
        const { data } = await api.post<{ id: string }>("/modifier-groups", payload);
        if (modal) setSelectedGroupIds((current) => current.includes(data.id) ? current : [...current, data.id]);
      }
      notify(editingGroup ? "Modifier group updated." : "Modifier group created.");
      setGroupModal(false);
      await load();
      if (groupEditorId) navigate((location.state as { from?: string } | null)?.from || "/menu");
    } catch (cause) { setError(errorMessage(cause)); }
  };
  const removeGroup = async (group: ModifierGroup) => {
    if (!window.confirm(`Delete “${group.name}”?`)) return;
    try { await api.delete(`/modifier-groups/${group.id}`); await load(); notify("Modifier group removed."); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  useEffect(() => {
    if (!groupEditorId) return;
    if (groupEditorId === "new") {
      if (editingGroup || !groupModal) openGroupEditor();
      return;
    }
    const group = modifierGroups.find((candidate) => candidate.id === groupEditorId);
    if (group && editingGroup?.id !== group.id) openGroupEditor(group);
  }, [groupEditorId, modifierGroups]);
  return (
    <div className="page-enter h-full w-full space-y-5">
      <PageHeader
        eyebrow="Admin · Dining room details"
        title="Menu"
        description={`${items.length} dishes across ${categories.length} menu sections. Manage what guests can order.`}
        action={
          <div className="flex gap-2">
            <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void readMenuWorkbook(file).then((rows) => {
                if (!rows.some((row) => row.some(Boolean))) { setError("That file has no dishes to import."); return; }
                setError("");
                setImportFile({ name: file.name, rows });
              }).catch(() => setError("Could not read that file. Use an Excel workbook (.xlsx) or a CSV."));
            }} />
            <button type="button" onClick={() => importInputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#f1dfe9] bg-white px-4 text-xs font-bold text-[#bb176e] transition hover:bg-[#fff4f9]"><FileSpreadsheet size={15} /> Import Excel</button>
            <button
              onClick={() => {
                setEditingItem(null);
                setSelectedCategory(categories[0]?.id ?? "");
                setName("");
                setPrice("");
                setPosition("0");
                setDescription("");
                setItemPrepStation("KITCHEN");
                setImageUrl("");
                setImageFile(null);
                setSelectedGroupIds([]);
                setError("");
                setModal(true);
              }}
              disabled={!categories.length}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ed168c] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#d80d7c] disabled:opacity-50"
            >
              <Plus size={15} /> Add dish
            </button>
            <button onClick={() => navigate("/tables")} className="h-10 rounded-xl border border-[#f1dfe9] bg-white px-4 text-xs font-bold text-[#bb176e] transition hover:bg-[#fff4f9]">New order</button>
          </div>
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
      <Panel className="overflow-hidden rounded-2xl border border-[#f1dfe9] bg-white shadow-card">
        <div className="flex flex-col gap-4 border-b border-line p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-[#fff4f9] p-1">
              <button onClick={() => { setActiveView("dishes"); setSearch(""); }} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${activeView === "dishes" ? "bg-white text-[#d90c7d] shadow-sm" : "text-muted"}`}>Dishes</button>
              <button onClick={() => { setActiveView("groups"); setSearch(""); }} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${activeView === "groups" ? "bg-white text-[#d90c7d] shadow-sm" : "text-muted"}`}>Options</button>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#fff4f9] text-[#d90c7d]"><Utensils size={14} /></span>
              {activeView === "dishes" ? `${visible.length} ${visible.length === 1 ? "dish" : "dishes"} · ${selectedCategoryName}` : `${shownGroups.length} ${shownGroups.length === 1 ? "option" : "options"}`}
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {activeView === "dishes" ? <div className="flex min-w-0 flex-1 items-center gap-1">
            <div className="scrollbar-hide flex min-w-0 gap-1 overflow-x-auto">
            {referencesLoading ? Array.from({ length: 5 }, (_, index) => <span key={index} className="h-8 w-20 shrink-0 animate-pulse rounded-lg bg-[#f8edf2]" />) : <>
            {[{ id: "all", name: "All dishes" }, ...categories].map(
              (category) => (
                <button
                  key={category.id}
                  onClick={() => setCategoryId(category.id)}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${categoryId === category.id ? "bg-[#ed168c] text-white" : "text-muted hover:bg-[#fff4f9] hover:text-ink"}`}
                >
                  {category.name}
                </button>
              ),
            )}
            </>}
            </div>
            <button type="button" onClick={() => { setName(""); setCategoryModal(true); }} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-dashed border-[#f3c6db] bg-white px-2.5 text-xs font-bold text-[#d90c7d] hover:bg-[#fff4f9]"><Plus size={13} /> Add category</button>
          </div> : <div className="scrollbar-hide flex gap-1 overflow-x-auto">
            {["All groups", ...new Set(modifierGroups.map((group) => group.category))].map((category) => <button key={category} onClick={() => setGroupCategoryFilter(category)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${groupCategoryFilter === category ? "bg-[#ed168c] text-white" : "text-muted hover:bg-[#fff4f9]"}`}>{category}</button>)}
          </div>}
          {activeView === "groups" && <button onClick={() => openGroupEditor()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#ed168c] px-4 text-xs font-bold text-white hover:bg-[#d80d7c]"><Plus size={15} /> New option</button>}
          <div className="relative sm:w-60">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeView === "groups" ? "Search groups" : "Search dishes"}
              className="h-10 w-full rounded-xl border border-line bg-[#fffdfd] pl-9 pr-3 text-xs outline-none transition focus:border-[#ed168c] sm:w-60"
            />
          </div>
        </div>
        </div>
        {activeView === "dishes" && itemsLoading && items.length === 0 ? <div className="divide-y divide-line" aria-label="Loading dishes">{Array.from({ length: 8 }, (_, index) => <div key={index} className="flex h-[81px] animate-pulse items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5"><span className="h-12 w-12 shrink-0 rounded-xl bg-[#f8edf2]" /><div className="min-w-0 flex-1 space-y-2"><span className="block h-3 w-40 rounded bg-[#f8edf2]" /><span className="block h-2.5 w-3/4 rounded bg-[#fbf2f6]" /></div><span className="h-7 w-16 rounded-lg bg-[#f8edf2]" /><span className="h-8 w-8 rounded-lg bg-[#fbf2f6]" /><span className="h-8 w-8 rounded-lg bg-[#fbf2f6]" /></div>)}</div> : activeView === "dishes" ? visible.length ? (
          <div className="divide-y divide-line">
            {visible.map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[#fffafd] sm:gap-4 sm:px-5"
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#fff0f7] text-[#d90c7d] ring-1 ring-[#f6d9e8]">
                  {item.imageUrl ? (
                    <img
                      src={mediaSrc(item.imageUrl)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Salad size={18} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-[#27212a]">{item.name}</p>
                    <span className="rounded-full bg-[#fff4f9] px-2.5 py-1 text-[9px] font-semibold text-[#bb176e]">
                      {item.category?.name ??
                        categories.find((c) => c.id === item.categoryId)?.name}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(item.modifierGroups ?? []).length ? (item.modifierGroups ?? []).map((link) => <span key={link.group.id} className="max-w-full truncate rounded-full bg-[#fff7fb] px-2 py-0.5 text-[10px] font-semibold text-[#9a3d6d]">{link.group.name}</span>) : <span className="text-[10px] font-semibold text-muted">No options assigned</span>}
                  </div>
                </div>
                <span className="whitespace-nowrap rounded-lg bg-[#fff4f9] px-3 py-2 text-sm font-bold text-[#27212a]">{money(item.price)}</span>
                <button
                  onClick={() => openEdit(item)}
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-[#fff0f7] hover:text-[#d90c7d]"
                  title="Edit dish"
                  aria-label={`Edit ${item.name}`}
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => void removeItem(item.id)}
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-rose-50 hover:text-rose-600"
                  title="Delete dish"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <Coffee className="mx-auto text-muted" />
            <p className="mt-3 text-sm font-semibold">No dishes in this view</p>
            <p className="mt-1 text-xs text-muted">
              Add a dish or change your search.
            </p>
          </div>
        ) : (() => {
          return referencesLoading ? <div className="divide-y divide-line" aria-label="Loading modifier groups">{Array.from({ length: 8 }, (_, index) => <div key={index} className="flex h-[81px] animate-pulse items-center gap-3 px-4 py-4 sm:px-5"><span className="h-10 w-10 rounded-xl bg-[#f8edf2]" /><span className="h-3 flex-1 rounded bg-[#f8edf2]" /><span className="h-7 w-24 rounded bg-[#fbf2f6]" /><span className="h-8 w-16 rounded bg-[#fbf2f6]" /></div>)}</div> : shownGroups.length ? <div className="divide-y divide-line">{shownGroups.map((group) => {
            const usedBy = group.menuItems?.map((link) => link.menuItem.name) ?? [];
            const usedByPreview = usedBy.length > 2 ? `${usedBy.slice(0, 2).join(", ")}…` : usedBy.join(", ");
            const appearanceLabel = ({ RADIO: "Radio buttons", CHECKBOX: "Checkboxes", SLIDER: "Slider", QUANTITY: "Quantity stepper", TEXT: "Text field", TOGGLE: "Toggles" } as const)[group.appearance ?? (group.selectionType === "SINGLE" ? "RADIO" : group.allowDuplicates ? "QUANTITY" : "CHECKBOX")];
            return <article key={group.id} className="grid grid-cols-1 items-center gap-3 px-4 py-4 transition hover:bg-[#fffafd] sm:grid-cols-[minmax(0,1.5fr)_minmax(170px,1fr)_auto] sm:px-5">
              <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff0f7] text-[#d90c7d]"><ModifierGroupIcon name={group.icon} size={18} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-[#27212a]">{group.name}</h3><span className="rounded-full bg-[#fff4f9] px-2.5 py-1 text-[9px] font-semibold text-[#bb176e]">{group.category}</span><span className="rounded-full bg-[#f5f5f4] px-2.5 py-1 text-[9px] font-semibold text-muted">{group.required ? "Required" : "Optional"} · Pick {group.minPicks}–{group.maxPicks}</span></div><p className="mt-1 truncate text-xs text-muted" title={group.options.map((option) => option.name).join(", ")}>{group.options.map((option) => `${option.name}${Number(option.priceAdjustment) > 0 ? ` (+${money(option.priceAdjustment)})` : ""}`).join(" · ") || "No options"}</p></div></div>
              <div className="min-w-0 text-center sm:px-3"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-muted">Used by</p><p className="truncate text-[11px] font-semibold text-[#27212a]" title={usedBy.join(", ")}>{usedByPreview || "No dishes yet"}</p></div>
              <div className="flex items-center justify-end gap-1 sm:gap-2"><span className="rounded-full bg-[#fff7fb] px-2.5 py-1 text-[9px] font-semibold text-muted">{appearanceLabel}</span><button onClick={() => openGroupEditor(group)} aria-label={`Edit ${group.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-[#fff0f7] hover:text-[#d90c7d]"><Pencil size={15} /></button><button onClick={() => void removeGroup(group)} aria-label={`Delete ${group.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button></div>
            </article>;
          })}</div> : <div className="p-12 text-center"><Utensils className="mx-auto text-muted" /><p className="mt-3 text-sm font-semibold">No options here</p><p className="mt-1 text-xs text-muted">Create an option once and attach it to any dish.</p></div>;
        })()}
      </Panel>
      {modal && (() => {
          const choiceClass = (selected: boolean) => `flex min-h-[52px] items-center gap-2 rounded-xl border px-3 text-left text-[13px] font-semibold ${selected ? "border-[#ed168c] text-ink" : "border-[#f3d5e4] text-ink"}`;
          return createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#291923]/35 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) closeItemEditor(); }}>
              <form ref={dishDialogRef} tabIndex={-1} onSubmit={(event) => void saveItem(event)} className="flex max-h-[min(92vh,760px)] w-full max-w-[560px] flex-col overflow-hidden rounded-[24px] bg-white shadow-float outline-none">
                <div className="flex items-center gap-3 px-6 pb-2 pt-5">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#fff0f7] text-[#ed168c]"><Utensils size={18} /></span>
                  <h2 className="flex-1 text-lg font-bold tracking-tight text-ink">{editingItem ? "Edit dish" : "New dish"}</h2>
                  <button type="button" onClick={closeItemEditor} aria-label="Close dialog" className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-[#fff4f9]"><X size={18} /></button>
                </div>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
                  {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</p>}
                  <section>
                    <h3 className="text-sm font-bold text-ink">Details</h3>
                    <p className="mt-0.5 text-xs text-muted">What staff and guests see</p>
                    <label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold text-ink">Dish name</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Pad Kra Pao" className="h-11 w-full rounded-xl border border-[#f3d5e4] bg-white px-3 text-sm outline-none focus:border-[#ed168c]" /></label>
                    <div className="mt-4"><span className="mb-2 block text-sm font-semibold text-ink">Category</span><div className="flex flex-wrap gap-2">{categories.map((category) => <button key={category.id} type="button" onClick={() => setSelectedCategory(category.id)} className={`rounded-xl border px-3 py-2 text-sm ${selectedCategory === category.id ? "border-[#ed168c] bg-[#fff4f9] font-semibold text-[#d90c7d]" : "border-[#f3d5e4] bg-white text-ink"}`}>{category.name}</button>)}</div></div>
                    <label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold text-ink">Price</span><span className="flex h-11 items-center rounded-xl border border-[#f3d5e4] bg-white px-3"><input required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /><span className="text-sm text-muted">THB</span></span></label>
                    <div className="mt-4"><p className="mb-2 text-sm font-semibold text-ink">Send to</p><div className="grid gap-2 sm:grid-cols-3">{([["KITCHEN", "Kitchen"], ["BAR", "Bar"], ["NONE", "Don't send"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setItemPrepStation(value)} className={choiceClass(itemPrepStation === value)}><span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${itemPrepStation === value ? "border-[#ed168c]" : "border-[#d9c3cf]"}`}>{itemPrepStation === value && <span className="h-2 w-2 rounded-full bg-[#ed168c]" />}</span>{label}</button>)}</div></div>
                  </section>
                  <section>
                    <h3 className="text-sm font-bold text-ink">Photo and description</h3>
                    <p className="mt-0.5 text-xs text-muted">Optional</p>
                    <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short description" rows={2} className="mt-3 w-full resize-none rounded-xl border border-[#f3d5e4] bg-white px-3 py-2 text-sm outline-none focus:border-[#ed168c]" />
                    <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#f3c6dc] bg-[#fff9fc] px-4 py-8 text-center"><Camera size={18} className="text-[#ed168c]" /><span className="mt-2 text-sm text-muted">{imageUrl ? "Change photo" : "Add a photo"}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0] ?? null; setImageFile(file); setImageUrl(file ? URL.createObjectURL(file) : editingItem?.imageUrl ?? ""); }} className="sr-only" /></label>
                    {imageUrl.trim() && <img src={mediaSrc(imageUrl.trim())} alt="Dish preview" className="mx-auto mt-3 h-28 rounded-lg object-cover" />}
                  </section>
                  <section>
                    <div className="flex items-center justify-between gap-3">
                      <div><h3 className="text-sm font-bold text-ink">Options</h3><p className="mt-0.5 text-xs text-muted">Choices waiters ask for on this dish.</p></div>
                      <button type="button" onClick={() => openGroupEditor()} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border border-[#f3d5e4] px-3 text-xs font-bold text-ink"><Plus size={13} /> New option</button>
                    </div>
                    <div className="mt-3 space-y-2">{selectedGroupIds.map((id) => { const group = modifierGroups.find((candidate) => candidate.id === id); if (!group) return null; return <div key={id} className="flex items-center gap-2 rounded-xl border border-[#f3d5e4] px-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{group.name}</p><p className="truncate text-xs text-muted">{group.required ? "Required" : "Optional"} · {group.options.map((option) => option.name).join(", ") || "No options"}</p></div><button type="button" onClick={() => openGroupEditor(group)} aria-label={`Edit ${group.name}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-[#fff0f7] hover:text-[#d90c7d]"><Pencil size={14} /></button><button type="button" onClick={() => setSelectedGroupIds((current) => current.filter((groupId) => groupId !== id))} aria-label={`Remove ${group.name}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600"><X size={14} /></button></div>; })}</div>
                    {modifierGroups.some((group) => !selectedGroupIds.includes(group.id)) && <div className="mt-3 flex flex-wrap gap-2">{modifierGroups.filter((group) => !selectedGroupIds.includes(group.id)).map((group) => <button key={group.id} type="button" onClick={() => setSelectedGroupIds((current) => [...current, group.id])} className="rounded-full border border-[#f3d5e4] bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-[#ed168c] hover:text-[#d90c7d]">+ {group.name}</button>)}</div>}
                  </section>
                </div>
                <div className="flex items-center justify-between border-t border-[#f6e8ef] px-6 py-4">
                  <button type="button" onClick={closeItemEditor} className="h-10 rounded-xl border border-[#f3d5e4] bg-white px-4 text-sm font-semibold text-ink">Cancel</button>
                  <button className="h-10 rounded-xl bg-[#ed168c] px-5 text-sm font-bold text-white hover:bg-[#d80d7c]">Save</button>
                </div>
              </form>
            </div>,
            document.body,
          );
      })()}
      {categoryModal && (
        <Modal title="Add a category" onClose={() => setCategoryModal(false)}>
          <form
            onSubmit={(event) => void createCategory(event)}
            className="space-y-4"
          >
            <Field
              label="Category name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Seasonal plates"
            />
            <button className="h-11 w-full rounded-xl bg-olive text-sm font-bold text-white hover:bg-[#334438]">
              Create category
            </button>
          </form>
        </Modal>
      )}
      {groupModal && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#291923]/35 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) closeGroupEditor(); }}>
          <form ref={groupDialogRef} tabIndex={-1} onSubmit={(event) => void saveGroup(event)} className="flex h-[min(88vh,760px)] w-full max-w-[680px] flex-col rounded-[28px] bg-white px-7 py-6 shadow-float outline-none">
            <h2 className="text-[22px] font-bold tracking-tight text-[#2a2430]">{editingGroup ? "Edit option" : "New option"}</h2>
            <p className="mt-1 text-[13px] text-[#9a8d96]">{editingGroup ? "Changes apply everywhere this option is used." : "Saved to the library, so other dishes can use it too."}</p>
            {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</p>}
            <label className="mt-5 block"><span className="mb-2 block text-sm font-semibold text-[#2a2430]">Name</span><input required value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Egg" className="h-12 w-full rounded-2xl border border-[#f3d5e4] bg-white px-4 text-sm outline-none focus:border-[#ed168c]" /></label>
            <div className="mt-4"><p className="mb-2 text-sm font-semibold text-[#2a2430]">Type</p><div className="flex flex-wrap gap-2">{([{ type: "RADIO", label: "Pick one" }, { type: "CHECKBOX", label: "Pick several" }, { type: "SLIDER", label: "Level" }, { type: "TOGGLE", label: "Toggle" }] as const).map((choice) => <button key={choice.type} type="button" aria-pressed={groupAppearance === choice.type} onClick={() => { setGroupAppearance(choice.type); if (choice.type === "RADIO" || choice.type === "SLIDER") { setGroupSelectionType("SINGLE"); setGroupMax("1"); setGroupAllowDuplicates(false); } else if (choice.type === "TOGGLE") { setGroupSelectionType("MULTIPLE"); setGroupMin("0"); setGroupAllowDuplicates(false); setGroupOptions((current) => current.some((option) => option.name.trim()) ? current : [{ name: "Chicken", nameMy: "", nameTh: "", priceAdjustment: "0", defaultSelected: true, active: true, opensGroupId: "" }, { name: "Potato", nameMy: "", nameTh: "", priceAdjustment: "0", defaultSelected: false, active: true, opensGroupId: "" }]); } else { setGroupSelectionType("MULTIPLE"); setGroupAllowDuplicates(false); } }} className={`h-10 rounded-xl border px-3 text-sm font-semibold ${groupAppearance === choice.type ? "border-[#ed168c] bg-[#fff4f9] text-[#d90c7d]" : "border-[#f3d5e4] text-[#2a2430]"}`}>{choice.label}</button>)}</div><p className="mt-1.5 text-xs text-[#b0a3ab]">{groupAppearance === "RADIO" ? "Waiters pick one choice." : groupAppearance === "SLIDER" ? "Waiters choose a level from the choices." : groupAppearance === "TOGGLE" ? "Each choice is a switch. On includes it, off leaves it out." : "Waiters can pick several choices."}</p></div>
            <div className="mt-4 flex items-center gap-3">
              <button type="button" role="switch" aria-checked={groupRequired} onClick={() => { const next = !groupRequired; setGroupRequired(next); if (next && Number(groupMin) < 1) setGroupMin("1"); if (!next && groupMin === "1") setGroupMin("0"); }} className={`relative h-7 w-12 shrink-0 rounded-full transition ${groupRequired ? "bg-[#ed168c]" : "bg-[#efe4ea]"}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition ${groupRequired ? "left-[22px]" : "left-0.5"}`} /></button>
              <span><span className="block text-sm font-semibold text-[#2a2430]">Required</span><span className="block text-[13px] text-[#b0a3ab]">{groupRequired ? "On, so guests must choose" : "Off, so guests can skip it"}</span></span>
            </div>
            <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
              <p className="text-sm font-semibold text-[#2a2430]">Choices</p>
              <div className="mt-1 divide-y divide-[#f6e8ef]">{groupOptions.map((option, index) => <div key={option.id ?? `new-${index}`} className="grid grid-cols-[16px_minmax(0,1fr)_88px_auto_auto] items-center gap-3 py-3">
                <GripHorizontal size={14} className="text-[#c9b7c0]" />
                {editingOptionIndex === index ? <input value={option.name} onChange={(event) => setGroupOptions((current) => current.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} placeholder="Choice name" aria-label={`Choice ${index + 1} name`} className="h-9 min-w-0 rounded-lg border border-[#f3d5e4] bg-white px-2 text-sm font-medium text-[#2a2430] outline-none focus:border-[#ed168c]" /> : <p className="truncate text-sm font-medium text-[#2a2430]">{option.name || "Untitled"}</p>}
                <span className="flex h-9 items-center justify-center gap-1 rounded-xl border border-[#f3d5e4] px-2"><input type="number" min="0" step="0.01" value={option.priceAdjustment} onChange={(event) => setGroupOptions((current) => current.map((row, i) => i === index ? { ...row, priceAdjustment: event.target.value } : row))} aria-label={`Choice ${index + 1} price`} className="w-10 bg-transparent text-right text-sm text-[#6d6168] outline-none" /><span className="text-xs text-[#9a8d96]">THB</span></span>
                <button type="button" onClick={() => setEditingOptionIndex(editingOptionIndex === index ? null : index)} aria-label={`Edit choice ${index + 1}`} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-[#fff0f7] hover:text-[#d90c7d]"><Pencil size={15} /></button>
                <button type="button" onClick={() => { setGroupOptions((current) => current.filter((_, i) => i !== index)); setEditingOptionIndex(null); }} aria-label={`Delete choice ${index + 1}`} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>)}</div>
              <button type="button" onClick={() => { setGroupOptions((current) => [...current, { name: "", nameMy: "", nameTh: "", priceAdjustment: "0", defaultSelected: false, active: true, opensGroupId: "" }]); setEditingOptionIndex(groupOptions.length); }} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#f3d5e4] px-3 text-sm font-medium text-[#2a2430]"><Plus size={14} /> Add choice</button>
              <div className="mt-6">
                <p className="text-sm font-semibold text-[#2a2430]">What the waiter sees</p>
                <p className="mt-0.5 text-xs text-[#b0a3ab]">A live preview of the selected type.</p>
                <div className="mt-3"><ModifierGroupLivePreview key={groupAppearance} name={groupName} nameMy={groupNameMy} required={groupRequired} appearance={groupAppearance} selectionType={groupSelectionType} minPicks={Number(groupMin)} includedPicks={Number(groupIncluded)} extraPickPrice={Number(groupExtraPickPrice)} maxPicks={Math.max(1, Number(groupMax))} options={groupOptions} /></div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button type="button" onClick={closeGroupEditor} className="h-11 rounded-2xl border border-[#f3d5e4] bg-white px-5 text-sm font-semibold text-[#2a2430]">Cancel</button>
              <button className="h-11 rounded-2xl bg-[#ed168c] px-6 text-sm font-bold text-white hover:bg-[#d80d7c]">Save</button>
            </div>
          </form>
        </div>,
        document.body,
      )}
      {importFile && <MenuImportDialog fileName={importFile.name} rows={importFile.rows} onClose={() => setImportFile(null)} onImported={(message) => { setImportFile(null); notify(message); void load(); }} />}
    </div>
  );
}
