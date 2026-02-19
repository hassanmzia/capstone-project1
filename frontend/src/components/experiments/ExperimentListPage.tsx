import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FlaskConical,
  Search,
  Plus,
  Filter,
  Calendar,
  Tag,
  MoreVertical,
  ChevronRight,
  Archive,
  CheckCircle2,
  Clock,
  FileText,
  HardDrive,
} from "lucide-react";

interface MockExperiment {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "completed" | "archived";
  owner: string;
  createdAt: string;
  recordingCount: number;
  tags: string[];
}

const seedExperiments: MockExperiment[] = [
  {
    id: "exp-001",
    name: "Hippocampal CA1 Place Cell Study",
    description: "Recording place cell activity during spatial navigation task in virtual environment",
    status: "active",
    owner: "Dr. Chen",
    createdAt: "2026-02-15",
    recordingCount: 12,
    tags: ["hippocampus", "place-cells", "navigation"],
  },
  {
    id: "exp-002",
    name: "Cortical Spike Timing Analysis",
    description: "High-density recording of cortical microcircuit dynamics during sensory stimulation",
    status: "active",
    owner: "Dr. Patel",
    createdAt: "2026-02-10",
    recordingCount: 8,
    tags: ["cortex", "spike-timing", "sensory"],
  },
  {
    id: "exp-003",
    name: "Retinal Ganglion Response Mapping",
    description: "Full-field mapping of retinal ganglion cell responses to patterned light stimuli",
    status: "completed",
    owner: "Dr. Kim",
    createdAt: "2026-01-28",
    recordingCount: 24,
    tags: ["retina", "ganglion", "light-response"],
  },
  {
    id: "exp-004",
    name: "Drug Screening - Compound 47B",
    description: "Evaluating neural activity modulation by experimental compound 47B on organoid cultures",
    status: "draft",
    owner: "Dr. Martinez",
    createdAt: "2026-02-17",
    recordingCount: 0,
    tags: ["drug-screening", "organoid", "pharmacology"],
  },
  {
    id: "exp-005",
    name: "Network Burst Detection Validation",
    description: "Benchmarking burst detection algorithms against ground-truth synthetic data",
    status: "archived",
    owner: "Dr. Chen",
    createdAt: "2025-12-15",
    recordingCount: 36,
    tags: ["validation", "burst-detection", "algorithm"],
  },
];

/** Count recordings per experiment from localStorage */
function countRecordingsPerExperiment(): Record<string, number> {
  const counts: Record<string, number> = {};
  try {
    const raw = localStorage.getItem("cnea_recordings");
    if (raw) {
      const recs = JSON.parse(raw) as { experimentName: string }[];
      for (const r of recs) {
        counts[r.experimentName] = (counts[r.experimentName] || 0) + 1;
      }
    }
  } catch { /* ignore */ }
  return counts;
}

function statusIcon(status: string) {
  switch (status) {
    case "active":
      return <CheckCircle2 className="w-4 h-4 text-neural-accent-green" />;
    case "completed":
      return <Archive className="w-4 h-4 text-neural-accent-blue" />;
    case "draft":
      return <FileText className="w-4 h-4 text-neural-accent-amber" />;
    case "archived":
      return <Archive className="w-4 h-4 text-neural-text-muted" />;
    default:
      return <Clock className="w-4 h-4 text-neural-text-muted" />;
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "active":
      return "bg-neural-accent-green/20 text-neural-accent-green";
    case "completed":
      return "bg-neural-accent-blue/20 text-neural-accent-blue";
    case "draft":
      return "bg-neural-accent-amber/20 text-neural-accent-amber";
    case "archived":
      return "bg-neural-text-muted/20 text-neural-text-muted";
    default:
      return "bg-neural-text-muted/20 text-neural-text-muted";
  }
}

export default function ExperimentListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Merge seed experiments with real recording counts
  const experiments = useMemo(() => {
    const recCounts = countRecordingsPerExperiment();
    return seedExperiments.map((exp) => ({
      ...exp,
      recordingCount: recCounts[exp.name] ?? exp.recordingCount,
    }));
  }, []);

  const filtered = experiments.filter((exp) => {
    const matchesSearch =
      search === "" ||
      exp.name.toLowerCase().includes(search.toLowerCase()) ||
      exp.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || exp.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 bg-neural-surface rounded-xl border border-neural-border p-2 md:p-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-neural-accent-purple" />
          <h1 className="text-base md:text-lg font-semibold text-neural-text-primary">Experiments</h1>
          <span className="text-sm text-neural-text-muted ml-2">({filtered.length})</span>
        </div>

        <div className="flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-3">
          {/* Search */}
          <div className="relative flex-1 md:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neural-text-muted" />
            <input
              type="text"
              placeholder="Search experiments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-neural-surface-alt border border-neural-border rounded-lg text-sm text-neural-text-primary placeholder:text-neural-text-muted focus:outline-none focus:border-neural-accent-cyan/50 w-full md:w-64"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1 bg-neural-surface-alt rounded-lg p-0.5 overflow-x-auto">
            <Filter className="w-4 h-4 text-neural-text-muted ml-2 shrink-0" />
            {["all", "active", "draft", "completed", "archived"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize neural-transition ${
                  statusFilter === s
                    ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                    : "text-neural-text-muted hover:text-neural-text-secondary"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            onClick={() => navigate("/experiments/new")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border border-neural-accent-cyan/30 neural-transition"
          >
            <Plus className="w-4 h-4" />
            New Experiment
          </button>
        </div>
      </div>

      {/* Experiment list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {filtered.map((exp) => (
          <div
            key={exp.id}
            onClick={() => navigate(`/experiments/${exp.id}`)}
            className="bg-neural-surface rounded-xl border border-neural-border p-4 hover:border-neural-border-bright neural-transition cursor-pointer group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {statusIcon(exp.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-sm font-semibold text-neural-text-primary truncate">
                      {exp.name}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadgeClass(exp.status)}`}>
                      {exp.status}
                    </span>
                  </div>
                  <p className="text-xs text-neural-text-muted mb-2 line-clamp-1">
                    {exp.description}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-neural-text-muted">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {exp.createdAt}
                    </span>
                    <span>{exp.owner}</span>
                    <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{exp.recordingCount} recordings</span>
                    <div className="flex gap-1">
                      {exp.tags.map((tag) => (
                        <span
                          key={tag}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-neural-surface-alt text-neural-text-muted"
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 neural-transition">
                <button
                  onClick={(e) => { e.stopPropagation(); alert(`Options for ${exp.name}`); }}
                  className="p-1.5 rounded-lg hover:bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                <ChevronRight className="w-4 h-4 text-neural-text-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
