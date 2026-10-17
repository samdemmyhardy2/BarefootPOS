import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import type { Role } from "../lib/types";
import { hasJobPermission, type JobPermission } from "../lib/access";

export function RequireAuth({ roles }: { roles?: Role[] }) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role))
    return <Navigate to="/overview" replace />;
  return <Outlet />;
}

export function RequireJobPermission({ permission }: { permission: JobPermission }) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!hasJobPermission(user, permission)) return <Navigate to="/tasks" replace />;
  return <Outlet />;
}
