import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { RequireAuth, RequireJobPermission } from "./components/RequireAuth";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { NewOrderPage } from "./pages/NewOrderPage";
import { KitchenPage } from "./pages/KitchenPage";
import { ReadyOrdersPage } from "./pages/ReadyOrdersPage";
import { TablesPage } from "./pages/TablesPage";
import { MenuPage } from "./pages/MenuPage";
import { TeamPage } from "./pages/TeamPage";
import { AttendancePage } from "./pages/AttendancePage";
import { AccountPage } from "./pages/AccountPage";
import { RoomsPage } from "./pages/RoomsPage";
import { TasksPage } from "./pages/TasksPage";
import { BusinessOverviewPage } from "./pages/BusinessOverviewPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route element={<RequireJobPermission permission="ORDER_VIEW" />}><Route path="overview" element={<OverviewPage />} /></Route>
          <Route element={<RequireJobPermission permission="REPORTS" />}><Route path="business-overview" element={<BusinessOverviewPage />} /></Route>
          <Route element={<RequireJobPermission permission="KITCHEN" />}><Route path="kitchen" element={<KitchenPage />} /></Route>
          <Route element={<RequireJobPermission permission="ORDER_SERVE" />}><Route path="ready" element={<ReadyOrdersPage />} /></Route>
          <Route element={<RequireJobPermission permission="TABLES" />}>
            <Route path="tables" element={<TablesPage />} />
            <Route element={<RequireJobPermission permission="ORDER_CREATE" />}><Route path="tables/:tableId" element={<NewOrderPage />} /></Route>
          </Route>
          <Route element={<RequireJobPermission permission="ROOM_VIEW" />}><Route path="rooms" element={<RoomsPage />} /></Route>
          <Route path="tasks" element={<TasksPage />} />
          <Route element={<RequireAuth roles={["ADMIN"]} />}>
            <Route path="menu" element={<MenuPage />} />
            <Route path="team" element={<TeamPage />} />
          </Route>
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
