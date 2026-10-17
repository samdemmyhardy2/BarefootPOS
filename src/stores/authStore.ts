import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../lib/api";
import { AUTH_EXPIRED_EVENT } from "../lib/authEvents";
import type { Role, User } from "../lib/types";

interface AuthState {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
}

function decodeUser(token: string, email: string): User {
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(encoded)) as {
      id?: string;
      sub?: string;
      email?: string;
      role?: Role;
      name?: string;
      jobTitle?: string;
      avatarUrl?: string | null;
    };
    return {
      id: payload.id ?? payload.sub ?? "",
      email: payload.email ?? email,
      name:
        payload.name ??
        email
          .split("@")[0]
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
      role: payload.role ?? "EMPLOYEE",
      jobTitle: payload.jobTitle ?? "Waiter",
      avatarUrl: payload.avatarUrl,
    };
  } catch {
    return { id: "", email, name: email.split("@")[0], role: "EMPLOYEE", jobTitle: "Waiter" };
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      login: async (email, password) => {
        const { data } = await api.post<{ access_token: string }>(
          "/auth/login",
          { email, password },
        );
        localStorage.setItem("restaurant-access-token", data.access_token);
        set({
          token: data.access_token,
          user: decodeUser(data.access_token, email),
        });
      },
      logout: () => {
        localStorage.removeItem("restaurant-access-token");
        set({ token: null, user: null });
      },
      refreshProfile: async () => {
        if (!get().token) return;
        const { data } = await api.get<User>("/auth/me");
        set({ user: data });
      },
      updateUser: (changes) => set((state) => ({ user: state.user ? { ...state.user, ...changes } : null })),
    }),
    {
      name: "restaurant-session",
      partialize: ({ token, user }) => ({ token, user }) as AuthState,
    },
  ),
);

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_EXPIRED_EVENT, () => {
    useAuthStore.getState().logout();
  });
}
