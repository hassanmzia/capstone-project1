import type { RouteObject } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import DashboardPage from "@/components/dashboard/DashboardPage";
import ExperimentListPage from "@/components/experiments/ExperimentListPage";
import RecordingBrowserPage from "@/components/recordings/RecordingBrowserPage";
import VisualizationPage from "@/components/visualization/VisualizationPage";
import ControlsPage from "@/components/controls/ControlsPage";
import AnalysisPage from "@/components/analysis/AnalysisPage";
import SettingsPage from "@/components/settings/SettingsPage";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "experiments", element: <ExperimentListPage /> },
      { path: "recordings", element: <RecordingBrowserPage /> },
      { path: "visualization", element: <VisualizationPage /> },
      { path: "controls", element: <ControlsPage /> },
      { path: "analysis", element: <AnalysisPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
];

export default routes;
