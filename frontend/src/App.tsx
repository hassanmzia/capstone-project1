import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import LoginPage from "@/components/auth/LoginPage";
import DashboardPage from "@/components/dashboard/DashboardPage";
import ExperimentListPage from "@/components/experiments/ExperimentListPage";
import ExperimentDetailPage from "@/components/experiments/ExperimentDetailPage";
import RecordingBrowserPage from "@/components/recordings/RecordingBrowserPage";
import RecordingDetailPage from "@/components/recordings/RecordingDetailPage";
import VisualizationPage from "@/components/visualization/VisualizationPage";
import ControlsPage from "@/components/controls/ControlsPage";
import AnalysisPage from "@/components/analysis/AnalysisPage";
import AnalysisDetailPage from "@/components/analysis/AnalysisDetailPage";
import NewAnalysisPage from "@/components/analysis/NewAnalysisPage";
import ReportsPage from "@/components/reports/ReportsPage";
import ReportViewPage from "@/components/reports/ReportViewPage";
import SettingsPage from "@/components/settings/SettingsPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public route */}
      <Route path="/login" element={<LoginGate />} />

      {/* Protected routes */}
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/experiments" element={<ExperimentListPage />} />
        <Route path="/experiments/:id" element={<ExperimentDetailPage />} />
        <Route path="/recordings" element={<RecordingBrowserPage />} />
        <Route path="/recordings/:id" element={<RecordingDetailPage />} />
        <Route path="/visualization" element={<VisualizationPage />} />
        <Route path="/controls" element={<ControlsPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/analysis/new" element={<NewAnalysisPage />} />
        <Route path="/analysis/:id" element={<AnalysisDetailPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/:id" element={<ReportViewPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

/** If already logged in, redirect to dashboard instead of showing login */
function LoginGate() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <LoginPage />;
}
