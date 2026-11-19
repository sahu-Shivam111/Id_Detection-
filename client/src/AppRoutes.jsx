import { Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import UploadPage from "./pages/UploadPage";
import HistoryPage from "./pages/HistoryPage";
import InspectionDetailPage from "./pages/InspectionDetailPage";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/new-inspection" element={<UploadPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/inspections/:id" element={<InspectionDetailPage />} />
    </Routes>
  );
}
