import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarOpen: boolean;
  theme: "light" | "dark";
  toast: { message: string; tone: "success" | "error" } | null;
  setSidebarOpen: (open: boolean) => void;
  notify: (message: string, tone?: "success" | "error") => void;
  clearToast: () => void;
  setTheme: (theme: "light" | "dark") => void;
}

export const useUiStore = create<UiState>()(persist((set) => ({
    sidebarOpen: false,
    theme: "light",
    toast: null,
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    notify: (message, tone = "success") => {
      set({ toast: { message, tone } });
      window.setTimeout(() => set({ toast: null }), 3500);
    },
    clearToast: () => set({ toast: null }),
    setTheme: (theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
      set({ theme });
    },
  }), { name: "restaurant-ui-preferences", partialize: ({ theme }) => ({ theme }) as UiState, onRehydrateStorage: () => (state) => {
    document.documentElement.classList.toggle("dark", state?.theme === "dark");
  } }));
