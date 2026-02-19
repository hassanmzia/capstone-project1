/**
 * Reports hub — lists existing generated reports and allows creating new ones
 * by selecting an experiment. Reports aggregate all recordings, analyses, and
 * AI-assisted scientific interpretation into a single downloadable document.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Plus,
  Clock,
  CheckCircle2,
  FlaskConical,
  HardDrive,
  BarChart3,
  Trash2,
} from "lucide-react";

/* ─── Types ─── */

export interface GeneratedReport {
  id: string;
  experimentId: string;
  experimentName: string;
  title: string;
  createdAt: string;
  recordingCount: number;
  analysisCount: number;
  status: "completed" | "generating";
}

/* ─── Persistence helpers ─── */

const REPORTS_KEY = "cnea_reports";

export function loadReports(): GeneratedReport[] {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    if (raw) return JSON.parse(raw) as GeneratedReport[];
  } catch { /* ignore */ }
  return seedReports;
}

export function saveReports(reports: GeneratedReport[]): void {
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}

/* ─── Seed data ─── */

const seedReports: GeneratedReport[] = [
  {
    id: "rpt-001",
    experimentId: "exp-001",
    experimentName: "Hippocampal CA1 Place Cell Study",
    title: "Comprehensive Neural Analysis Report — Hippocampal CA1 Place Cell Study",
    createdAt: "2026-02-19 08:30",
    recordingCount: 2,
    analysisCount: 6,
    status: "completed",
  },
];

/* ─── Experiment source ─── */

interface ExperimentOption {
  id: string;
  name: string;
  status: string;
  recordingCount: number;
}

const seedExperiments: ExperimentOption[] = [
  { id: "exp-001", name: "Hippocampal CA1 Place Cell Study", status: "active", recordingCount: 12 },
  { id: "exp-002", name: "Cortical Spike Timing Analysis", status: "active", recordingCount: 8 },
  { id: "exp-003", name: "Retinal Ganglion Response Mapping", status: "completed", recordingCount: 24 },
  { id: "exp-005", name: "Network Burst Detection Validation", status: "archived", recordingCount: 36 },
];

/* ─── Component ─── */

export default function ReportsPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<GeneratedReport[]>(loadReports);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState<string | null>(null);

  const existingExpIds = useMemo(
    () => new Set(reports.map((r) => r.experimentId)),
    [reports]
  );

  const handleGenerate = () => {
    if (!selectedExperiment) return;
    const exp = seedExperiments.find((e) => e.id === selectedExperiment);
    if (!exp) return;

    const newReport: GeneratedReport = {
      id: `rpt-user-${Date.now()}`,
      experimentId: exp.id,
      experimentName: exp.name,
      title: `Comprehensive Neural Analysis Report — ${exp.name}`,
      createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      recordingCount: exp.recordingCount,
      analysisCount: 6,
      status: "completed",
    };

    const updated = [newReport, ...reports];
    setReports(updated);
    saveReports(updated);
    setShowNewDialog(false);
    setSelectedExperiment(null);
    navigate(`/reports/${newReport.id}`);
  };

  const handleDelete = (id: string) => {
    const updated = reports.filter((r) => r.id !== id);
    setReports(updated);
    saveReports(updated);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between bg-neural-surface rounded-xl border border-neural-border p-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-neural-accent-purple" />
          <h1 className="text-lg font-semibold text-neural-text-primary">Reports</h1>
          <span className="text-xs text-neural-text-muted ml-2">
            AI-assisted scientific analysis reports
          </span>
        </div>
        <button
          onClick={() => setShowNewDialog(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-accent-purple/20 text-neural-accent-purple hover:bg-neural-accent-purple/30 border border-neural-accent-purple/30 neural-transition"
        >
          <Plus className="w-4 h-4" />
          Generate Report
        </button>
      </div>

      {/* New report dialog */}
      {showNewDialog && (
        <div className="bg-neural-surface rounded-xl border border-neural-accent-purple/30 p-5">
          <h2 className="text-sm font-semibold text-neural-text-primary mb-1">Generate New Report</h2>
          <p className="text-xs text-neural-text-muted mb-4">
            Select an experiment to generate a comprehensive AI-assisted scientific report covering all recordings and analyses.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {seedExperiments.map((exp) => {
              const alreadyGenerated = existingExpIds.has(exp.id);
              return (
                <button
                  key={exp.id}
                  onClick={() => setSelectedExperiment(exp.id)}
                  className={`flex items-start gap-3 p-3 rounded-lg neural-transition text-left border ${
                    selectedExperiment === exp.id
                      ? "bg-neural-accent-purple/10 border-neural-accent-purple/40"
                      : "bg-neural-surface-alt hover:bg-neural-border border-neural-border hover:border-neural-border-bright"
                  }`}
                >
                  <FlaskConical className={`w-4 h-4 mt-0.5 shrink-0 ${selectedExperiment === exp.id ? "text-neural-accent-purple" : "text-neural-text-muted"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neural-text-primary truncate">{exp.name}</div>
                    <div className="text-xs text-neural-text-muted mt-0.5">
                      {exp.recordingCount} recordings &middot; {exp.status}
                      {alreadyGenerated && (
                        <span className="ml-1 text-neural-accent-amber">(report exists)</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={!selectedExperiment}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border neural-transition ${
                selectedExperiment
                  ? "bg-neural-accent-purple/20 text-neural-accent-purple border-neural-accent-purple/30 hover:bg-neural-accent-purple/30"
                  : "bg-neural-surface-alt text-neural-text-muted border-neural-border cursor-not-allowed"
              }`}
            >
              <FileText className="w-4 h-4" />
              Generate Report
            </button>
            <button
              onClick={() => { setShowNewDialog(false); setSelectedExperiment(null); }}
              className="px-4 py-2 rounded-lg text-sm text-neural-text-muted hover:text-neural-text-primary neural-transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reports list */}
      <div className="flex-1 bg-neural-surface rounded-xl border border-neural-border p-4 overflow-y-auto">
        <h2 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider mb-3">
          Generated Reports
        </h2>

        {reports.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-neural-text-muted mx-auto mb-3" />
            <p className="text-sm text-neural-text-muted">No reports generated yet</p>
            <p className="text-xs text-neural-text-muted mt-1">Click "Generate Report" to create your first comprehensive analysis report.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="p-4 rounded-lg bg-neural-surface-alt border border-neural-border hover:border-neural-border-bright neural-transition cursor-pointer group"
                onClick={() => navigate(`/reports/${report.id}`)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {report.status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4 text-neural-accent-green" />
                    ) : (
                      <Clock className="w-4 h-4 text-neural-accent-cyan animate-pulse" />
                    )}
                    <span className="text-sm font-medium text-neural-text-primary">{report.title}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(report.id); }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-neural-accent-red/20 text-neural-text-muted hover:text-neural-accent-red neural-transition"
                    title="Delete report"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-4 text-xs text-neural-text-muted">
                  <span className="flex items-center gap-1">
                    <FlaskConical className="w-3 h-3" />
                    {report.experimentName}
                  </span>
                  <span className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    {report.recordingCount} recordings
                  </span>
                  <span className="flex items-center gap-1">
                    <BarChart3 className="w-3 h-3" />
                    {report.analysisCount} analyses
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {report.createdAt}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
