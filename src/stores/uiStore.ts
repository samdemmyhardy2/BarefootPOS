import { create } from "zustand";
import { persist } from "zustand/middleware";
import { translateUiText } from "../lib/translations";

interface UiState {
  sidebarOpen: boolean;
  theme: "light" | "dark";
  language: "en" | "my" | "th";
  toast: { message: string; tone: "success" | "error" } | null;
  setSidebarOpen: (open: boolean) => void;
  notify: (message: string, tone?: "success" | "error") => void;
  clearToast: () => void;
  setTheme: (theme: "light" | "dark") => void;
  setLanguage: (language: "en" | "my" | "th") => void;
}

export const useUiStore = create<UiState>()(persist((set) => ({
    sidebarOpen: false,
    theme: "light",
    language: "en",
    toast: null,
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
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
  }), { name: "restaurant-ui-preferences", partialize: ({ theme, language }) => ({ theme, language }) as UiState, onRehydrateStorage: () => (state) => {
    document.documentElement.classList.toggle("dark", state?.theme === "dark");
  } }));
