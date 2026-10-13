import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import type { Role } from "../lib/types";

export function RequireAuth({ roles }: { roles?: Role[] }) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role))
    return <Navigate to="/overview" replace />;
  return <Outlet />;
}
