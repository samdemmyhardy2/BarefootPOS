import { create } from "zustand";
import { persist } from "zustand/middleware";
import { translateUiText } from "../lib/translations";

interface UiState {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  theme: "light" | "dark";
  language: "en" | "my" | "th";
  restaurantName: string;
  restaurantLogoUrl: string | null;
  toast: { message: string; tone: "success" | "error" } | null;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  notify: (message: string, tone?: "success" | "error") => void;
  clearToast: () => void;
  setTheme: (theme: "light" | "dark") => void;
  setLanguage: (language: "en" | "my" | "th") => void;
  setRestaurantIdentity: (name: string, logoUrl: string | null) => void;
}

export const useUiStore = create<UiState>()(persist((set) => ({
    sidebarOpen: false,
    sidebarCollapsed: false,
    theme: "light",
    language: "en",
    restaurantName: "Table & Thyme",
    restaurantLogoUrl: null,
    toast: null,
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    notify: (message, tone = "success") => {
      set((state) => ({ toast: { message: translateUiText(state.language, message), tone } }));
      window.setTimeout(() => set({ toast: null }), 3500);
    },
    clearToast: () => set({ toast: null }),
    setTheme: (theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
      set({ theme });
    },
    setLanguage: (language) => set({ language }),
    setRestaurantIdentity: (restaurantName, restaurantLogoUrl) => set({ restaurantName, restaurantLogoUrl }),
  }), { name: "restaurant-ui-preferences", partialize: ({ theme, language, sidebarCollapsed, restaurantName, restaurantLogoUrl }) => ({ theme, language, sidebarCollapsed, restaurantName, restaurantLogoUrl }) as UiState, onRehydrateStorage: () => (state) => {
    document.documentElement.classList.toggle("dark", state?.theme === "dark");
  } }));
