import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Camera, LogOut, Moon, Sun, UserRound, Utensils } from "lucide-react";
import { Field, PageHeader, Panel } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { initials, type RestaurantIdentity, type User } from "../lib/types";
import { useAuthStore } from "../stores/authStore";
import { useUiStore } from "../stores/uiStore";
import { translate } from "../lib/translations";

export function AccountPage() {
  const user = useAuthStore((state) => state.user)!;
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const updateUser = useAuthStore((state) => state.updateUser);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const language = useUiStore((state) => state.language);
  const setLanguage = useUiStore((state) => state.setLanguage);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const notify = useUiStore((state) => state.notify);
  const [name, setName] = useState(user.name);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState(user.avatarUrl ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restaurantName, setRestaurantName] = useState("Table & Thyme");
  const [restaurantLogoFile, setRestaurantLogoFile] = useState<File | null>(null);
  const [restaurantLogoPreview, setRestaurantLogoPreview] = useState("");
  const [restaurantBusy, setRestaurantBusy] = useState(false);
  const setRestaurantIdentity = useUiStore((state) => state.setRestaurantIdentity);
  const isAdmin = user.role === "ADMIN";

  useEffect(() => {
    void refreshProfile().catch(() => undefined);
  }, [refreshProfile]);

  useEffect(() => {
    if (!isAdmin) return;
    void api.get<RestaurantIdentity>("/restaurant-settings").then(({ data }) => {
      setRestaurantName(data.name);
      setRestaurantLogoPreview(data.logoUrl ?? "");
      setRestaurantIdentity(data.name, data.logoUrl);
    }).catch((cause) => setError(errorMessage(cause)));
  }, [isAdmin, setRestaurantIdentity]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      let avatarUrl = user.avatarUrl ?? null;
      if (image) {
        const form = new FormData();
        form.append("file", image);
        const uploaded = await api.post<{ imageUrl: string }>("/media/images", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        avatarUrl = uploaded.data.imageUrl;
      }
      const { data } = await api.patch<User>("/auth/me", { name, avatarUrl });
      updateUser(data);
      setPreview(data.avatarUrl ?? "");
      setImage(null);
      notify("Profile saved.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/auth/me/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      notify("Password changed.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveRestaurantIdentity = async (event: FormEvent) => {
    event.preventDefault();
    setRestaurantBusy(true);
    setError("");
    try {
      let logoUrl: string | null = restaurantLogoPreview || null;
      if (restaurantLogoFile) {
        const form = new FormData();
        form.append("file", restaurantLogoFile);
        const uploaded = await api.post<{ imageUrl: string }>("/media/images", form, { headers: { "Content-Type": "multipart/form-data" } });
        logoUrl = uploaded.data.imageUrl;
      }
      const { data } = await api.patch<RestaurantIdentity>("/restaurant-settings", { name: restaurantName.trim(), logoUrl });
      setRestaurantName(data.name);
      setRestaurantLogoPreview(data.logoUrl ?? "");
      setRestaurantLogoFile(null);
      setRestaurantIdentity(data.name, data.logoUrl);
      notify("Restaurant identity saved.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRestaurantBusy(false);
    }
  };

  return (
    <div className="page-enter">
      <PageHeader eyebrow="Your workspace" title={t("account")} description="Manage your profile, sign-in security, and display preferences." action={<button onClick={() => { logout(); navigate("/login"); }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-xs font-bold text-ink hover:bg-canvas"><LogOut size={14} /> Sign out</button>} />
      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
        {isAdmin && <Panel className="p-5 sm:p-6 lg:col-span-2">
          <div className="mb-5 flex items-center gap-3"><Building2 size={18} className="text-olive" /><div><h2 className="font-display text-base font-bold">Restaurant identity</h2><p className="mt-1 text-xs text-muted">Set the restaurant name and logo shown in the sidebar for your team.</p></div></div>
          <form onSubmit={(event) => void saveRestaurantIdentity(event)} className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Restaurant name" required maxLength={80} value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} />
            <div className="flex items-center gap-3 sm:min-w-64">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-canvas text-olive">{restaurantLogoPreview ? <img src={restaurantLogoPreview} alt="Restaurant logo preview" className="h-full w-full object-contain" /> : <Utensils size={22} />}</div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-xs font-bold hover:bg-canvas"><Camera size={14} /> Upload logo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setRestaurantLogoFile(file); setRestaurantLogoPreview(URL.createObjectURL(file)); } }} /></label>
              {restaurantLogoPreview && <button type="button" onClick={() => { setRestaurantLogoFile(null); setRestaurantLogoPreview(""); }} className="text-xs font-semibold text-rose-600">Remove</button>}
            </div>
            <button disabled={restaurantBusy || !restaurantName.trim()} className="h-11 rounded-xl bg-olive px-5 text-sm font-bold text-white hover:bg-[#334438] disabled:opacity-50 sm:col-span-2">{restaurantBusy ? "Saving…" : "Save restaurant identity"}</button>
          </form>
        </Panel>}
        <Panel className="p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><UserRound size={18} className="text-olive" /><h2 className="font-display text-base font-bold">{t("profile")}</h2></div>
          <form onSubmit={(event) => void saveProfile(event)} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-citrus text-lg font-bold text-olive">
                {preview ? <img src={preview} alt="Profile" className="h-full w-full object-cover" /> : initials(user.name)}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs font-bold hover:bg-canvas"><Camera size={14} /> Change photo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setImage(file); setPreview(URL.createObjectURL(file)); } }} /></label>
            </div>
            <Field label="Full name" required value={name} onChange={(event) => setName(event.target.value)} />
            <Field label="Email address" value={user.email} readOnly />
            <Field label="Restaurant position" value={user.role === "ADMIN" ? "Administrator" : user.jobTitle || "Waiter"} readOnly />
            <button disabled={busy} className="h-11 w-full rounded-xl bg-olive text-sm font-bold text-white hover:bg-[#334438] disabled:opacity-50">Save profile</button>
          </form>
        </Panel>
        <div className="space-y-5">
          <Panel className="p-5 sm:p-6">
            <div className="mb-5"><h2 className="font-display text-base font-bold">Change password</h2><p className="mt-1 text-xs text-muted">Use at least 8 characters for your new password.</p></div>
            <form onSubmit={(event) => void changePassword(event)} className="space-y-4">
              <Field label="Current password" type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              <Field label="New password" type="password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              <button disabled={busy} className="h-11 w-full rounded-xl border border-line bg-white text-sm font-bold hover:bg-canvas disabled:opacity-50">Update password</button>
            </form>
          </Panel>
          <Panel className="p-5 sm:p-6">
            <div className="mb-4"><h2 className="font-display text-base font-bold">{translate(language, "language")}</h2><p className="mt-1 text-xs text-muted">{translate(language, "languageHelp")}</p></div>
            <select aria-label={translate(language, "language")} value={language} onChange={(event) => setLanguage(event.target.value as "en" | "my" | "th")} className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-olive">
              <option value="en">{translate(language, "english")}</option><option value="my">{translate(language, "burmese")}</option><option value="th">{translate(language, "thai")}</option>
            </select>
          </Panel>
          <Panel className="p-5 sm:p-6">
            <div className="mb-4"><h2 className="font-display text-base font-bold">{t("appearance")}</h2><p className="mt-1 text-xs text-muted">Choose the theme for this device.</p></div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setTheme("light")} className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold ${theme === "light" ? "border-olive bg-olive-soft text-olive" : "border-line bg-white text-muted"}`}><Sun size={16} /> Light</button>
              <button onClick={() => setTheme("dark")} className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold ${theme === "dark" ? "border-olive bg-olive text-white" : "border-line bg-white text-muted"}`}><Moon size={16} /> Dark</button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
