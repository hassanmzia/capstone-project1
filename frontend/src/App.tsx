import { Routes, Route } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
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
import SettingsPage from "@/components/settings/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
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
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
