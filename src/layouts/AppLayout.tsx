import { useEffect } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
} from "react-router-dom";
import {
  BedDouble,
  BookOpen,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Utensils,
  X,
} from "lucide-react";
import { useAuthStore } from "../stores/authStore";
import { useOrderStore } from "../stores/orderStore";
import { useUiStore } from "../stores/uiStore";
import { initials } from "../lib/types";
import { Toast } from "../components/Toast";
import { observeUiTranslations } from "../lib/uiLocalization";
import { hasJobPermission, type JobPermission } from "../lib/access";
import { api } from "../lib/api";
import type { RestaurantIdentity } from "../lib/types";

const baseNav = [
  { label: "Overview", to: "/overview", icon: LayoutDashboard, permission: "ORDER_VIEW" },
  { label: "Order history", to: "/orders", icon: ClipboardList, permission: "ORDER_VIEW" },
  { label: "Tables", to: "/tables", icon: Utensils, permission: "TABLES" },
  { label: "Rooms & folios", to: "/rooms", icon: BedDouble, permission: "ROOM_VIEW" },
  { label: "Menu", to: "/menu", icon: BookOpen, adminOnly: true },
  { label: "Kitchen display", to: "/kitchen", icon: ChefHat, permission: "KITCHEN" },
];

export function AppLayout() {
  const user = useAuthStore((state) => state.user)!;
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const connectLive = useOrderStore((state) => state.connectLive);
  const disconnectLive = useOrderStore((state) => state.disconnectLive);
  const liveState = useOrderStore((state) => state.liveState);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const restaurantName = useUiStore((state) => state.restaurantName);
  const restaurantLogoUrl = useUiStore((state) => state.restaurantLogoUrl);
  const setRestaurantIdentity = useUiStore((state) => state.setRestaurantIdentity);
  const language = useUiStore((state) => state.language);
  const location = useLocation();
  const fullCanvas = location.pathname.startsWith("/menu") || location.pathname.startsWith("/tables") || location.pathname.startsWith("/rooms");
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
        className={`fixed inset-y-0 left-0 z-40 flex w-[220px] flex-col border-r border-line bg-white px-4 pb-5 pt-5 shadow-[12px_0_36px_rgba(32,37,31,.035)] transition-all duration-300 md:w-[220px] md:translate-x-0 md:px-4 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-1">
          <Link to="/overview" className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-[#f71591] text-white">
              {restaurantLogoUrl ? <img src={restaurantLogoUrl} alt={`${restaurantName} logo`} className="h-full w-full bg-white object-contain" /> : <Utensils size={19} strokeWidth={2.2} />}
            </span>
            <span>
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
        </div>
        <div className="mt-9 mb-1 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#a3a79e]">
          Workspace
        </div>
        <nav className="scrollbar-hide mt-2 flex-1 space-y-1 overflow-y-auto">
          {nav.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition duration-150 ${isActive ? "bg-[#f71591] text-white shadow-[0_6px_16px_rgba(247,21,145,.18)]" : "text-[#62685f] hover:translate-x-0.5 hover:bg-canvas hover:text-ink"}`
              }
            >
              <Icon size={17} strokeWidth={1.9} />
              <span className="flex-1">{label}</span>
              {to === "/kitchen" && liveState === "live" && (
                <span className="h-1.5 w-1.5 rounded-full bg-citrus" />
              )}
            </NavLink>
          ))}
        </nav>
        <Link to="/account" className="mt-4 flex items-center gap-3 rounded-2xl border border-line p-3 hover:bg-canvas">
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-citrus text-xs font-bold text-olive">
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold">{user.name}</p>
            <p className="mt-0.5 text-[10px] text-muted">
              {user.role === "ADMIN" ? "Administrator" : user.jobTitle || "Restaurant team"}
            </p>
          </div>
          <span className="text-[10px] font-semibold text-muted">Account</span>
        </Link>
      </aside>
      <div className="min-h-screen md:pl-[220px]">
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 top-4 z-30 grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-ink shadow-card md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <main className={`mx-auto min-h-screen w-full ${location.pathname === "/tables" ? "pt-16 px-4 pb-4 sm:px-5 md:pt-5" : location.pathname.startsWith("/rooms") ? "pt-16 px-4 pb-4 sm:px-5 md:pt-5" : "pt-16 px-4 pb-4 sm:px-7 lg:px-9 md:pt-8"} ${fullCanvas ? "max-w-none" : "max-w-[1500px]"}`}>
          <Outlet />
        </main>
      </div>
      <Toast />
    </div>
  );
}
