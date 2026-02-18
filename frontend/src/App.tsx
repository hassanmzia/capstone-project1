import { Routes, Route } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import DashboardPage from "@/components/dashboard/DashboardPage";
import ExperimentListPage from "@/components/experiments/ExperimentListPage";
import RecordingBrowserPage from "@/components/recordings/RecordingBrowserPage";
import VisualizationPage from "@/components/visualization/VisualizationPage";
import ControlsPage from "@/components/controls/ControlsPage";
import AnalysisPage from "@/components/analysis/AnalysisPage";
import SettingsPage from "@/components/settings/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/experiments" element={<ExperimentListPage />} />
        <Route path="/recordings" element={<RecordingBrowserPage />} />
        <Route path="/visualization" element={<VisualizationPage />} />
        <Route path="/controls" element={<ControlsPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
