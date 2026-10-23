import { useEffect } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
} from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  BedDouble,
  ChefHat,
  ChevronDown,
  Clock3,
  ClipboardList,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  Menu,
  Salad,
  Utensils,
  Users,
  ServerCog,
  X,
} from "lucide-react";
import { useAuthStore } from "../stores/authStore";
import { useOrderStore } from "../stores/orderStore";
import { useUiStore } from "../stores/uiStore";
import { initials } from "../lib/types";
import { Toast } from "../components/Toast";
import { observeUiTranslations } from "../lib/uiLocalization";
import { translate } from "../lib/translations";
import { hasJobPermission, type JobPermission } from "../lib/access";
import { api } from "../lib/api";
import type { RestaurantIdentity } from "../lib/types";

const baseNav = [
  { label: "Overview", to: "/overview", icon: LayoutDashboard, permission: "ORDER_VIEW" },
  { label: "Order history", to: "/orders", icon: ClipboardList, permission: "ORDER_VIEW" },
  { label: "Business overview", to: "/business-overview", icon: BarChart3, permission: "REPORTS" },
  { label: "Tables", to: "/tables", icon: Utensils, permission: "TABLES" },
  { label: "Rooms & folios", to: "/rooms", icon: BedDouble, permission: "ROOM_VIEW" },
  { label: "My attendance", to: "/attendance" as const, icon: Clock3 },
  { label: "Tasks", to: "/tasks" as const, icon: ClipboardList },
  { label: "Kitchen display", to: "/kitchen", icon: ChefHat, permission: "KITCHEN" },
  { label: "Ready to serve", to: "/ready", icon: Bell, permission: "ORDER_SERVE" },
  { label: "Menu", to: "/menu", icon: Salad, adminOnly: true },
  { label: "Team", to: "/team", icon: Users, adminOnly: true },
  { label: "Technical status", to: "/technical", icon: ServerCog, adminOnly: true },
];

export function AppLayout() {
  const user = useAuthStore((state) => state.user)!;
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const connectLive = useOrderStore((state) => state.connectLive);
  const disconnectLive = useOrderStore((state) => state.disconnectLive);
  const liveState = useOrderStore((state) => state.liveState);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const restaurantName = useUiStore((state) => state.restaurantName);
  const restaurantLogoUrl = useUiStore((state) => state.restaurantLogoUrl);
  const setRestaurantIdentity = useUiStore((state) => state.setRestaurantIdentity);
  const language = useUiStore((state) => state.language);
  const setLanguage = useUiStore((state) => state.setLanguage);
  const location = useLocation();
  const fullCanvas = location.pathname === "/menu" || location.pathname.startsWith("/tables");
  const nav = baseNav.filter((item) => user.role === "ADMIN" || (!item.adminOnly && (!item.permission || hasJobPermission(user, item.permission as JobPermission))));

  useEffect(() => {
    if (hasJobPermission(user, "ORDER_VIEW")) void connectLive();
    return disconnectLive;
  }, [connectLive, disconnectLive, user]);
  useEffect(() => { void refreshProfile().catch(() => undefined); }, [refreshProfile]);
  useEffect(() => {
    void api.get<RestaurantIdentity>("/restaurant-settings")
      .then(({ data }) => setRestaurantIdentity(data.name, data.logoUrl))
      .catch(() => undefined);
  }, [setRestaurantIdentity]);
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, setSidebarOpen]);
  useEffect(() => observeUiTranslations(language), [language]);
  useEffect(() => {
    document.title = `${restaurantName} · Restaurant operations`;
  }, [restaurantName]);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-ink/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[220px] flex-col border-r border-line bg-white pb-5 pt-5 shadow-[12px_0_36px_rgba(32,37,31,.035)] transition-all duration-300 md:translate-x-0 ${sidebarCollapsed ? "md:w-[72px] md:px-2" : "md:w-[220px] md:px-4"} px-4 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-1">
          <Link to="/overview" className={`flex min-w-0 flex-1 items-center gap-3 ${sidebarCollapsed ? "md:gap-0" : ""}`}>
            <span className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-[#f71591] text-white ${sidebarCollapsed ? "md:h-6 md:w-6 md:rounded-lg" : ""}`}>
              {restaurantLogoUrl ? <img src={restaurantLogoUrl} alt={`${restaurantName} logo`} className="h-full w-full bg-white object-contain" /> : <Utensils size={19} className={sidebarCollapsed ? "md:h-4 md:w-4" : ""} strokeWidth={2.2} />}
            </span>
            <span className={sidebarCollapsed ? "md:hidden" : ""}>
              <span className="block min-w-0 whitespace-normal break-words font-display text-[15px] font-extrabold leading-tight tracking-[-.04em]">
                {restaurantName}
              </span>
              <span className="mt-0.5 block whitespace-normal break-words text-[10px] font-semibold uppercase tracking-[.15em] text-muted">
                Restaurant ops
              </span>
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas md:hidden"
            aria-label="Close menu"
          >
            <X size={17} />
          </button>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`hidden shrink-0 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink md:grid ${sidebarCollapsed ? "h-6 w-6" : "h-8 w-8"}`}
          >
            {sidebarCollapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
          </button>
        </div>
        <div className={`mt-9 mb-1 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#a3a79e] ${sidebarCollapsed ? "md:hidden" : ""}`}>
          Workspace
        </div>
        <nav className="scrollbar-hide mt-2 flex-1 space-y-1 overflow-y-auto">
          {nav.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition duration-150 ${sidebarCollapsed ? "md:justify-center md:px-0" : ""} ${isActive ? "bg-[#f71591] text-white shadow-[0_6px_16px_rgba(247,21,145,.18)]" : "text-[#62685f] hover:translate-x-0.5 hover:bg-canvas hover:text-ink"}`
              }
              title={sidebarCollapsed ? label : undefined}
              aria-label={sidebarCollapsed ? label : undefined}
            >
              <Icon size={17} strokeWidth={1.9} />
              <span className={`flex-1 ${sidebarCollapsed ? "md:hidden" : ""}`}>{label}</span>
              {to === "/kitchen" && liveState === "live" && (
                <span className="h-1.5 w-1.5 rounded-full bg-citrus" />
              )}
            </NavLink>
          ))}
        </nav>
        <div className={`rounded-2xl bg-[#f2f5ed] p-4 ${sidebarCollapsed ? "md:mx-auto md:bg-transparent md:p-2" : ""}`} title={sidebarCollapsed ? "Live orders" : undefined}>
          <div className={`mb-2 flex items-center gap-2 text-[11px] font-bold text-olive ${sidebarCollapsed ? "md:mb-0 md:justify-center" : ""}`}>
            <Activity size={14} /> <span className={sidebarCollapsed ? "md:hidden" : ""}>Live orders</span>
            <span
              className={`${sidebarCollapsed ? "ml-auto md:ml-0" : "ml-auto"} h-2 w-2 rounded-full ${liveState === "live" ? "bg-emerald-500" : liveState === "connecting" ? "animate-pulse bg-amber-400" : "bg-rose-400"}`}
            />
          </div>
          <p className={`text-xs leading-5 text-[#747d70] ${sidebarCollapsed ? "md:hidden" : ""}`}>
            {liveState === "live"
              ? "Kitchen and floor are in sync."
              : liveState === "connecting"
                ? "Connecting to your team…"
                : "Reconnecting to live updates…"}
          </p>
        </div>
        <Link to="/account" title={sidebarCollapsed ? user.name : undefined} className={`mt-4 flex items-center gap-3 rounded-2xl border border-line p-3 hover:bg-canvas ${sidebarCollapsed ? "md:justify-center md:px-1" : ""}`}>
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-citrus text-xs font-bold text-olive">
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(user.name)}
          </div>
          <div className={`min-w-0 flex-1 ${sidebarCollapsed ? "md:hidden" : ""}`}>
            <p className="truncate text-xs font-bold">{user.name}</p>
            <p className="mt-0.5 text-[10px] text-muted">
              {user.role === "ADMIN" ? "Administrator" : user.jobTitle || "Restaurant team"}
            </p>
          </div>
          <span className={`text-[10px] font-semibold text-muted ${sidebarCollapsed ? "md:hidden" : ""}`}>Account</span>
        </Link>
      </aside>
      <div className={`min-h-screen ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[220px]"}`}>
        {location.pathname !== "/tables" && <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-line/80 bg-white/85 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white text-ink md:hidden"
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <div>
              <p className="text-[11px] font-medium text-muted">
                Good to see you, {user.name.split(" ")[0]}
              </p>
              <p className="mt-0.5 text-xs font-bold">
                {new Intl.DateTimeFormat("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                }).format(new Date())}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold sm:flex ${liveState === "live" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${liveState === "live" ? "bg-emerald-500" : "animate-pulse bg-amber-400"}`}
              />
              {liveState === "live" ? "Live sync on" : "Connecting"}
            </div>
            <label className="flex h-9 items-center gap-1.5 rounded-xl border border-line bg-white px-2 text-xs font-semibold text-ink" aria-label={translate(language, "language")}>
              <span className="sr-only">{translate(language, "language")}</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value as "en" | "my" | "th")} className="max-w-[100px] cursor-pointer bg-transparent text-xs font-semibold outline-none sm:max-w-none" aria-label={translate(language, "language")}>
                <option value="en">English</option><option value="my">မြန်မာ</option><option value="th">ไทย</option>
              </select>
            </label>
            <Link to="/account" className="flex items-center gap-2 rounded-full border border-line bg-white p-1 pr-2.5">
              <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-[#ecefe7] text-[10px] font-bold text-olive">
                {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(user.name)}
              </span>
              <ChevronDown size={14} className="text-muted" />
            </Link>
          </div>
        </header>}
        <main className={`mx-auto min-h-[calc(100vh-70px)] w-full ${location.pathname === "/tables" ? "p-4 sm:p-5" : "p-4 sm:p-7 lg:px-9 lg:py-8"} ${fullCanvas ? "max-w-none" : "max-w-[1500px]"}`}>
          <Outlet />
        </main>
      </div>
      <Toast />
    </div>
  );
}
