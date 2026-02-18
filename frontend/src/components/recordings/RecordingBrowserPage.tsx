import { useState } from "react";
import {
  HardDrive,
  Search,
  Download,
  Trash2,
  Play,
  Calendar,
  Clock,
  FileText,
  Filter,
  SortDesc,
} from "lucide-react";

interface MockRecording {
  id: string;
  name: string;
  experimentName: string;
  date: string;
  duration: string;
  spikeCount: number;
  channels: number;
  fileSize: string;
  format: string;
  status: "completed" | "error" | "processing";
}

const mockRecordings: MockRecording[] = [
  { id: "rec-042", name: "session_042", experimentName: "Hippocampal CA1 Place Cell Study", date: "2026-02-18 09:15", duration: "15:32", spikeCount: 48291, channels: 64, fileSize: "2.4 GB", format: "HDF5", status: "completed" },
  { id: "rec-041", name: "session_041", experimentName: "Hippocampal CA1 Place Cell Study", date: "2026-02-17 14:22", duration: "30:10", spikeCount: 95100, channels: 64, fileSize: "4.8 GB", format: "HDF5", status: "completed" },
  { id: "rec-040", name: "session_040", experimentName: "Cortical Spike Timing Analysis", date: "2026-02-16 11:05", duration: "10:00", spikeCount: 22430, channels: 32, fileSize: "1.1 GB", format: "NWB", status: "completed" },
  { id: "rec-039", name: "session_039", experimentName: "Cortical Spike Timing Analysis", date: "2026-02-15 16:40", duration: "05:45", spikeCount: 0, channels: 32, fileSize: "540 MB", format: "NWB", status: "processing" },
  { id: "rec-038", name: "session_038", experimentName: "Retinal Ganglion Response Mapping", date: "2026-02-14 10:30", duration: "20:00", spikeCount: 67800, channels: 128, fileSize: "6.2 GB", format: "HDF5", status: "completed" },
  { id: "rec-037", name: "session_037_failed", experimentName: "Retinal Ganglion Response Mapping", date: "2026-02-14 09:00", duration: "02:15", spikeCount: 1200, channels: 128, fileSize: "320 MB", format: "RAW", status: "error" },
];

export default function RecordingBrowserPage() {
  const [search, setSearch] = useState("");

  const filtered = mockRecordings.filter(
    (r) =>
      search === "" ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.experimentName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-neural-surface rounded-xl border border-neural-border p-3">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-neural-accent-blue" />
          <h1 className="text-lg font-semibold text-neural-text-primary">Recordings</h1>
          <span className="text-sm text-neural-text-muted ml-2">({filtered.length})</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neural-text-muted" />
            <input
              type="text"
              placeholder="Search recordings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-neural-surface-alt border border-neural-border rounded-lg text-sm text-neural-text-primary placeholder:text-neural-text-muted focus:outline-none focus:border-neural-accent-cyan/50 w-64"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border border-neural-border neural-transition">
            <Filter className="w-4 h-4" />
            Filter
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border border-neural-border neural-transition">
            <SortDesc className="w-4 h-4" />
            Sort
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-neural-surface rounded-xl border border-neural-border overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto h-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neural-border text-xs text-neural-text-muted uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Experiment</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Duration</th>
                <th className="text-right px-4 py-3 font-medium">Spikes</th>
                <th className="text-center px-4 py-3 font-medium">Ch</th>
                <th className="text-right px-4 py-3 font-medium">Size</th>
                <th className="text-center px-4 py-3 font-medium">Format</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-center px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rec) => (
                <tr
                  key={rec.id}
                  className="border-b border-neural-border/50 hover:bg-neural-surface-alt neural-transition cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-neural-text-muted shrink-0" />
                      <span className="font-mono text-neural-text-primary">{rec.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neural-text-secondary max-w-48 truncate">
                    {rec.experimentName}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-neural-text-muted">
                      <Calendar className="w-3 h-3" />
                      {rec.date}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-neural-text-secondary">
                      <Clock className="w-3 h-3" />
                      <span className="font-mono">{rec.duration}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-neural-accent-cyan">
                      {rec.spikeCount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-neural-text-secondary">
                    {rec.channels}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-neural-text-secondary">
                    {rec.fileSize}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 rounded bg-neural-surface-alt text-xs text-neural-text-muted">
                      {rec.format}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        rec.status === "completed"
                          ? "bg-neural-accent-green/20 text-neural-accent-green"
                          : rec.status === "processing"
                          ? "bg-neural-accent-amber/20 text-neural-accent-amber"
                          : "bg-neural-accent-red/20 text-neural-accent-red"
                      }`}
                    >
                      {rec.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button className="p-1 rounded hover:bg-neural-border text-neural-text-muted hover:text-neural-accent-green neural-transition" title="Open">
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1 rounded hover:bg-neural-border text-neural-text-muted hover:text-neural-accent-blue neural-transition" title="Download">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1 rounded hover:bg-neural-border text-neural-text-muted hover:text-neural-accent-red neural-transition" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
