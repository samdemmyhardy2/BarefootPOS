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
import { AccountPage } from "./pages/AccountPage";
import { RoomsPage } from "./pages/RoomsPage";
import { BusinessOverviewPage } from "./pages/BusinessOverviewPage";
import { OrdersPage } from "./pages/OrdersPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route path="/kitchen" element={<KitchenPage station="KITCHEN" standalone />} />
        <Route element={<RequireAuth />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route element={<RequireJobPermission permission="ORDER_VIEW" />}><Route path="overview" element={<OverviewPage />} /></Route>
          <Route element={<RequireJobPermission permission="ORDER_VIEW" />}><Route path="orders" element={<OrdersPage />} /></Route>
          <Route element={<RequireJobPermission permission="REPORTS" />}><Route path="business-overview" element={<BusinessOverviewPage />} /></Route>
          <Route element={<RequireJobPermission permission="BAR" />}><Route path="bar" element={<KitchenPage station="BAR" />} /></Route>
          <Route element={<RequireJobPermission permission="ORDER_SERVE" />}><Route path="ready" element={<ReadyOrdersPage />} /></Route>
          <Route element={<RequireJobPermission permission="TABLES" />}>
            <Route path="tables" element={<TablesPage />} />
            <Route element={<RequireJobPermission permission="ORDER_CREATE" />}><Route path="tables/:tableId" element={<NewOrderPage />} /></Route>
          </Route>
          <Route element={<RequireJobPermission permission="ROOM_VIEW" />}><Route path="rooms" element={<RoomsPage />} /></Route>
          <Route element={<RequireJobPermission permission="ORDER_CREATE" />}><Route path="rooms/service/:stayId" element={<NewOrderPage />} /></Route>
          <Route element={<RequireAuth roles={["ADMIN"]} />}>
            <Route path="menu/*" element={<MenuPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="printers" element={<Navigate to="/account/printers" replace />} />
            <Route path="account/printers" element={<AccountPage />} />
            <Route path="email-import" element={<Navigate to="/account/email" replace />} />
            <Route path="account/email" element={<AccountPage />} />
          </Route>
          <Route path="account" element={<AccountPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
