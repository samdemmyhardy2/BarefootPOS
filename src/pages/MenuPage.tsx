import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Coffee, Pencil, Plus, Search, Salad, Trash2 } from "lucide-react";
import { Field, Modal, PageHeader, Panel, SelectField } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import type { Category, MenuItem } from "../lib/types";
import { money } from "../lib/types";
import { useUiStore } from "../stores/uiStore";
import { localizedFoodLabels, splitFoodLabels } from "../lib/foodTranslations";

export function MenuPage() {
  type FoodField = "allergens" | "dietaryInfo" | "availableExtras";
  type FoodLabelLanguages = Record<"en" | "my" | "th", string>;
  type FoodLabels = Record<FoodField, FoodLabelLanguages>;
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categoryId, setCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [categoryModal, setCategoryModal] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const emptyFoodLabels = (): FoodLabels => ({
    allergens: { en: "", my: "", th: "" },
    dietaryInfo: { en: "", my: "", th: "" },
    availableExtras: { en: "", my: "", th: "" },
  });
  const [foodLabels, setFoodLabels] = useState<FoodLabels>(emptyFoodLabels);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [error, setError] = useState("");
  const notify = useUiStore((state) => state.notify);
  const language = useUiStore((state) => state.language);
  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Category[]>("/categories");
      setCategories(data);
      setItems(
        data.flatMap((category) =>
          (category.items ?? []).map((item) => ({ ...item, category })),
        ),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = items.filter(
    (item) =>
      (categoryId === "all" || item.categoryId === categoryId) &&
      `${item.name} ${item.description ?? ""} ${splitFoodLabels(item.allergens).join(" ")} ${splitFoodLabels(item.dietaryInfo).join(" ")} ${splitFoodLabels(item.availableExtras).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
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
        categoryId: selectedCategory,
        imageUrl: hostedImageUrl || (editingItem ? null : undefined),
        allergens: splitFoodLabels(foodLabels.allergens.en),
        allergensMy: splitFoodLabels(foodLabels.allergens.my),
        allergensTh: splitFoodLabels(foodLabels.allergens.th),
        dietaryInfo: splitFoodLabels(foodLabels.dietaryInfo.en),
        dietaryInfoMy: splitFoodLabels(foodLabels.dietaryInfo.my),
        dietaryInfoTh: splitFoodLabels(foodLabels.dietaryInfo.th),
        availableExtras: splitFoodLabels(foodLabels.availableExtras.en),
        availableExtrasMy: splitFoodLabels(foodLabels.availableExtras.my),
        availableExtrasTh: splitFoodLabels(foodLabels.availableExtras.th),
      };
      if (editingItem) {
        await api.patch(`/menu-items/${editingItem.id}`, payload);
      } else {
        await api.post("/menu-items", payload);
      }
      notify(editingItem ? "Dish updated." : "Dish added to the menu.");
      setModal(false);
      setEditingItem(null);
      setName("");
      setPrice("");
      setDescription("");
      setImageUrl("");
      setImageFile(null);
      setFoodLabels(emptyFoodLabels());
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    setName(item.name);
    setPrice(String(item.price));
    setDescription(item.description ?? "");
    setImageUrl(item.imageUrl ?? "");
    setImageFile(null);
    setFoodLabels({
      allergens: { en: splitFoodLabels(item.allergens).join(", "), my: splitFoodLabels(item.allergensMy).join(", "), th: splitFoodLabels(item.allergensTh).join(", ") },
      dietaryInfo: { en: splitFoodLabels(item.dietaryInfo).join(", "), my: splitFoodLabels(item.dietaryInfoMy).join(", "), th: splitFoodLabels(item.dietaryInfoTh).join(", ") },
      availableExtras: { en: splitFoodLabels(item.availableExtras).join(", "), my: splitFoodLabels(item.availableExtrasMy).join(", "), th: splitFoodLabels(item.availableExtrasTh).join(", ") },
    });
    setSelectedCategory(item.categoryId);
    setError("");
    setModal(true);
  };
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
    if (!window.confirm("Delete this dish from the menu?")) return;
    try {
      await api.delete(`/menu-items/${id}`);
      setItems((current) => current.filter((item) => item.id !== id));
      notify("Dish removed.");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const removeCategory = async (category: Category) => {
    if (
      !window.confirm(
        `Delete “${category.name}”? The category needs to be empty.`,
      )
    )
      return;
    try {
      await api.delete(`/categories/${category.id}`);
      await load();
      notify("Category removed.");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <div className="page-enter h-full w-full">
      <PageHeader
        eyebrow="Admin · Dining room details"
        title="The menu"
        description={`${items.length} dishes across ${categories.length} menu sections.`}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => {
                setName("");
                setCategoryModal(true);
              }}
              className="h-10 rounded-xl border border-line bg-white px-3.5 text-xs font-bold hover:bg-canvas"
            >
              Add category
            </button>
            <button
              onClick={() => {
                setEditingItem(null);
                setSelectedCategory(categories[0]?.id ?? "");
                setName("");
                setPrice("");
                setDescription("");
                setImageUrl("");
                setImageFile(null);
                setFoodLabels(emptyFoodLabels());
                setError("");
                setModal(true);
              }}
              disabled={!categories.length}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-olive px-4 text-xs font-bold text-white hover:bg-[#334438] disabled:opacity-50"
            >
              <Plus size={15} /> Add dish
            </button>
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
      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="scrollbar-hide flex gap-1 overflow-x-auto">
            {[{ id: "all", name: "All dishes" }, ...categories].map(
              (category) => (
                <button
                  key={category.id}
                  onClick={() => setCategoryId(category.id)}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${categoryId === category.id ? "bg-olive text-white" : "text-muted hover:bg-canvas hover:text-ink"}`}
                >
                  {category.name}
                </button>
              ),
            )}
          </div>
          <div className="relative sm:w-60">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes"
              className="h-9 w-full rounded-lg border border-line pl-9 pr-3 text-xs outline-none focus:border-olive"
            />
          </div>
        </div>
        {visible.length ? (
          <div className="divide-y divide-line">
            {visible.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-4 sm:px-5"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f0f3eb] text-olive">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Salad size={18} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold">{item.name}</p>
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-[9px] font-semibold text-muted">
                      {item.category?.name ??
                        categories.find((c) => c.id === item.categoryId)?.name}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">
                    {item.description || "No description added."}
                  </p>
                  {(item.allergens?.length || item.dietaryInfo?.length || item.availableExtras?.length) ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {localizedFoodLabels(item.allergens, item.allergensMy, item.allergensTh, language).map((label) => <span key={`a-${label}`} className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-800">{label}</span>)}
                      {localizedFoodLabels(item.dietaryInfo, item.dietaryInfoMy, item.dietaryInfoTh, language).map((label) => <span key={`d-${label}`} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-800">{label}</span>)}
                      {localizedFoodLabels(item.availableExtras, item.availableExtrasMy, item.availableExtrasTh, language).map((label) => <span key={`e-${label}`} className="rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-semibold text-sky-800">{label}</span>)}
                    </div>
                  ) : null}
                </div>
                <span className="text-sm font-bold">{money(item.price)}</span>
                <button
                  onClick={() => openEdit(item)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-olive"
                  title="Edit dish"
                  aria-label={`Edit ${item.name}`}
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => void removeItem(item.id)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600"
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
        )}
      </Panel>
      {categories.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => void removeCategory(category)}
              className="rounded-full border border-line bg-white px-3 py-1.5 text-[10px] font-semibold text-muted hover:border-rose-200 hover:text-rose-600"
            >
              {category.name} <span className="ml-1">×</span>
            </button>
          ))}
        </div>
      )}
      {modal && (
        <Modal title={editingItem ? "Edit dish" : "Add a dish"} onClose={() => setModal(false)}>
          <form
            onSubmit={(event) => void saveItem(event)}
            className="space-y-4"
          >
            <Field
              label="Dish name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Crispy tofu bowl"
            />
            <Field
              label="Price"
              type="number"
              required
              min="0.01"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
            <Field
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short, delicious description"
            />
            {([
              { key: "allergens", label: "Known allergens", placeholder: "e.g. peanuts, milk, wheat" },
              { key: "dietaryInfo", label: "Dietary labels", placeholder: "e.g. vegetarian, vegan, contains dairy" },
              { key: "availableExtras", label: "Extras offered for this dish", placeholder: "e.g. add tomato, extra cheese" },
            ] as const).map((field) => (
              <fieldset key={field.key} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-3">
                <legend className="px-1 text-xs font-semibold text-ink">{field.label}</legend>
                {([
                  { lang: "en", label: "English" },
                  { lang: "my", label: "Burmese" },
                  { lang: "th", label: "Thai" },
                ] as const).map(({ lang, label }) => (
                  <label key={lang} className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold text-muted">{label}</span>
                    <input
                      value={foodLabels[field.key][lang]}
                      onChange={(event) => setFoodLabels((current) => ({ ...current, [field.key]: { ...current[field.key], [lang]: event.target.value } }))}
                      placeholder={lang === "en" ? field.placeholder : `Enter ${label.toLowerCase()} labels`}
                      aria-label={`${field.label} (${label})`}
                      required
                      className="focus-ring h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none focus:border-olive"
                    />
                    <span className="mt-1 block text-[10px] text-muted">{lang === "en" ? "English" : lang === "my" ? "မြန်မာ" : "ภาษาไทย"} · comma-separated, same order</span>
                  </label>
                ))}
                <p className="text-[10px] text-muted sm:col-span-3">All three languages are required. Enter “None” in all three fields when no labels apply.</p>
              </fieldset>
            ))}
            <div>
              <Field
                label="Upload image"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setImageFile(file);
                  setImageUrl(file ? URL.createObjectURL(file) : editingItem?.imageUrl ?? "");
                }}
              />
              {imageUrl.trim() && (
                <img
                  src={imageUrl.trim()}
                  alt="Dish preview"
                  onError={(event) => { event.currentTarget.style.display = "none"; }}
                  onLoad={(event) => { event.currentTarget.style.display = "block"; }}
                  className="mt-3 h-32 w-full rounded-xl object-cover"
                />
              )}
              <p className="mt-1 text-[11px] text-muted">JPG, PNG, WEBP, or GIF up to 5 MB. Images are stored on this server.</p>
            </div>
            <SelectField
              label="Category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectField>
            <button className="h-11 w-full rounded-xl bg-olive text-sm font-bold text-white hover:bg-[#334438]">
              {editingItem ? "Save changes" : "Add dish"}
            </button>
          </form>
        </Modal>
      )}
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
    </div>
  );
}
