import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { RequireAuth } from "./components/RequireAuth";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { NewOrderPage } from "./pages/NewOrderPage";
import { OrderTrackerPage } from "./pages/OrderTrackerPage";
import { KitchenPage } from "./pages/KitchenPage";
import { ReadyOrdersPage } from "./pages/ReadyOrdersPage";
import { TablesPage } from "./pages/TablesPage";
import { MenuPage } from "./pages/MenuPage";
import { TeamPage } from "./pages/TeamPage";
import { AttendancePage } from "./pages/AttendancePage";
import { AccountPage } from "./pages/AccountPage";
import { RoomsPage } from "./pages/RoomsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="orders" element={<NewOrderPage />} />
          <Route path="tracker" element={<OrderTrackerPage />} />
          <Route path="kitchen" element={<KitchenPage />} />
          <Route path="ready" element={<ReadyOrdersPage />} />
          <Route path="tables" element={<TablesPage />} />
          <Route path="rooms" element={<RoomsPage />} />
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
