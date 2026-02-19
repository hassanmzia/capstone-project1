/**
 * ReportViewPage — Renders a full PhD-grade AI-assisted scientific report for
 * an experiment. Includes executive summary, methodology, data acquisition,
 * all 6 analysis types with findings, discussion, conclusions, and
 * recommendations. Supports download in PDF, HTML, Markdown, and Word formats.
 */

import { useParams, useNavigate } from "react-router-dom";
import { useMemo, useRef } from "react";
import {
  ArrowLeft,
  FileText,
  Download,
  FileDown,
  Printer,
  FlaskConical,
  HardDrive,
  BarChart3,
  Clock,
  CheckCircle2,
  Brain,
  Activity,
  Zap,
  Layers,
  GitBranch,
  Timer,
  AudioWaveform,
} from "lucide-react";
import { loadReports, type GeneratedReport } from "./ReportsPage";

/* ─── Experiment-specific report data keyed by experimentId ─── */

interface RecordingMeta {
  id: string;
  name: string;
  date: string;
  duration: string;
  channels: number;
  samplingRate: string;
  sizeGb: string;
}

interface AnalysisFinding {
  type: string;
  icon: React.ElementType;
  summary: string;
  details: string[];
  metrics: { label: string; value: string }[];
}

interface ReportData {
  pi: string;
  institution: string;
  department: string;
  abstract: string;
  executiveSummary: string;
  methodology: string[];
  dataAcquisition: { overview: string; recordings: RecordingMeta[] };
  analyses: AnalysisFinding[];
  discussion: string[];
  conclusions: string[];
  recommendations: string[];
  references: string[];
}

function getReportData(report: GeneratedReport): ReportData {
  /* Default comprehensive data — represents a rich, AI-generated report */
  return {
    pi: "Dr. Sarah Chen",
    institution: "Neural Systems Research Institute",
    department: "Department of Computational Neuroscience",

    abstract:
      `This report presents a comprehensive analysis of neural recordings obtained during the "${report.experimentName}" experiment. ` +
      `A total of ${report.recordingCount} recording sessions were collected and subjected to ${report.analysisCount} distinct analytical pipelines ` +
      `encompassing spike sorting, burst detection, principal component analysis (PCA), cross-correlation, inter-spike interval (ISI) analysis, ` +
      `and spectral decomposition. The combined analysis reveals significant spatiotemporal patterns in neuronal firing activity, ` +
      `identifies distinct functional cell assemblies, and characterizes oscillatory dynamics across multiple frequency bands. ` +
      `These findings advance our understanding of circuit-level information processing and provide a quantitative foundation ` +
      `for targeted follow-up investigations.`,

    executiveSummary:
      `The "${report.experimentName}" experiment yielded high-quality multi-electrode array (MEA) recordings ` +
      `spanning ${report.recordingCount} sessions with consistent signal-to-noise ratios exceeding 8:1 across the majority of channels. ` +
      `Spike sorting identified 47 well-isolated single units with an average isolation distance of 23.4 (SD = 6.2). ` +
      `Burst detection revealed coordinated population events occurring at a mean frequency of 0.34 Hz, ` +
      `with 68% of detected bursts involving more than 15 simultaneously active units. ` +
      `PCA dimensionality reduction demonstrated that 89% of population variance is captured by the first 8 principal components, ` +
      `suggesting a low-dimensional neural manifold. Cross-correlation analysis uncovered 12 statistically significant ` +
      `functional connectivity pairs (p < 0.001, Bonferroni-corrected), with predominant feedforward directionality. ` +
      `ISI distributions confirmed Poisson-like firing for the majority of units (CV = 1.02 \u00B1 0.18), ` +
      `while a subset of 8 units exhibited bursting behavior (CV > 1.5). ` +
      `Spectral analysis identified prominent theta (6\u20138 Hz) and gamma (30\u201380 Hz) oscillations with significant ` +
      `theta-gamma phase-amplitude coupling (modulation index = 0.023, p < 0.01). ` +
      `Collectively, these results support the hypothesis of hierarchically organized neural ensembles ` +
      `with distinct oscillatory signatures governing information transfer.`,

    methodology: [
      "Multi-electrode array (MEA) recordings were acquired using a 64-channel silicon probe (NeuroNexus A4x16) " +
        "with 25 \u00B5m inter-electrode spacing, implanted stereotaxically into the target region under isoflurane anesthesia (1.5\u20132%).",
      "Signals were amplified (x200) and digitized at 30 kHz using an Intan RHD2164 headstage connected to an Open Ephys acquisition board. " +
        "A 300 Hz\u20136 kHz bandpass filter was applied in hardware for spike-band extraction; a parallel 0.1\u2013300 Hz channel captured LFP.",
      "Spike sorting was performed using Kilosort 3.0 with manual curation in Phy. Units were classified as well-isolated " +
        "if they exhibited < 1% inter-spike interval violations (< 2 ms refractory period), an isolation distance > 15, and an L-ratio < 0.1.",
      "Burst detection used a rank-surprise algorithm (L\u00E9gEndy & Salcman, 1985) with a surprise threshold of S \u2265 3 " +
        "and minimum burst length of 3 spikes. Network bursts required \u2265 5 simultaneously bursting units within a 50 ms window.",
      "PCA was computed on z-scored population firing rate vectors (25 ms bins) using singular value decomposition. " +
        "The number of significant dimensions was determined via a broken-stick null model.",
      "Pairwise cross-correlograms were computed at 1 ms resolution for \u00B1100 ms lag windows. " +
        "Significant peaks were identified using a jitter-corrected method (1000 jittered surrogates, \u00B15 ms uniform jitter) " +
        "with Bonferroni correction for multiple comparisons.",
      "ISI distributions were fitted with gamma distributions; coefficient of variation (CV) and local variation (LV) " +
        "were computed to characterize firing regularity. Units with CV > 1.5 were classified as bursty.",
      "Spectral analysis used multi-taper estimation (3 tapers, time-bandwidth product = 4) on 2 s epochs with 50% overlap. " +
        "Phase-amplitude coupling was quantified using the modulation index (Tort et al., 2010) " +
        "between theta phase (4\u201312 Hz) and gamma amplitude (30\u2013100 Hz).",
    ],

    dataAcquisition: {
      overview:
        `Data were acquired across ${report.recordingCount} sessions over a period of 14 days. ` +
        `Each session comprised continuous recordings of 20\u201345 minutes duration under controlled behavioral conditions. ` +
        `Total acquired data volume exceeds 18 GB of raw neural signals. ` +
        `Post-acquisition quality control removed < 3% of channels due to excessive impedance (> 1 M\u03A9) or noise artifacts.`,
      recordings: [
        {
          id: "rec-001",
          name: "Baseline Spontaneous Activity",
          date: "2026-02-01",
          duration: "32 min",
          channels: 64,
          samplingRate: "30 kHz",
          sizeGb: "4.2",
        },
        {
          id: "rec-002",
          name: "Stimulus-Evoked Response — Protocol A",
          date: "2026-02-03",
          duration: "45 min",
          channels: 64,
          samplingRate: "30 kHz",
          sizeGb: "5.8",
        },
      ],
    },

    analyses: [
      {
        type: "Spike Sorting",
        icon: Zap,
        summary:
          "Kilosort 3.0 identified 47 well-isolated single units and 23 multi-unit clusters across all recording sessions.",
        details: [
          "Mean isolation distance: 23.4 (SD = 6.2); L-ratio: 0.042 (SD = 0.028) — well within accepted thresholds.",
          "ISI violation rate < 0.8% across all accepted units, confirming single-unit purity.",
          "Waveform morphology analysis revealed 31 regular-spiking (putative pyramidal) and 16 fast-spiking (putative interneuron) units based on trough-to-peak duration (threshold: 0.4 ms).",
          "Unit yield remained stable across sessions (coefficient of variation < 12%), indicating consistent recording quality.",
          "Template matching amplitude ranged from 85 to 340 \u00B5V (median: 142 \u00B5V), with SNR distributed between 6.2 and 18.7.",
        ],
        metrics: [
          { label: "Total Units", value: "47" },
          { label: "Multi-units", value: "23" },
          { label: "Mean SNR", value: "11.4" },
          { label: "ISI Violation Rate", value: "< 0.8%" },
          { label: "Isolation Distance", value: "23.4 \u00B1 6.2" },
        ],
      },
      {
        type: "Burst Detection",
        icon: Activity,
        summary:
          "Detected 1,247 single-unit bursts and 89 network-level burst events across all sessions.",
        details: [
          "Network bursts occurred at a mean rate of 0.34 Hz with a mean duration of 127 ms (SD = 43 ms).",
          "68% of network bursts recruited more than 15 units, indicating highly synchronized population events.",
          "Burst initiation showed spatial clustering: 73% of network bursts originated from electrodes in the dorsal quadrant (channels 1\u201316).",
          "Inter-burst interval distribution followed a log-normal distribution (\u03BC = 1.8 s, \u03C3 = 0.6), consistent with a renewal process model.",
          "Single-unit burst index (fraction of spikes within bursts) ranged from 0.08 to 0.62, with bursty interneurons showing the highest values.",
        ],
        metrics: [
          { label: "Network Bursts", value: "89" },
          { label: "Single-unit Bursts", value: "1,247" },
          { label: "Mean Burst Rate", value: "0.34 Hz" },
          { label: "Mean Duration", value: "127 ms" },
          { label: "Recruitment", value: "> 15 units (68%)" },
        ],
      },
      {
        type: "PCA / Dimensionality Reduction",
        icon: Layers,
        summary:
          "Population activity resides on a low-dimensional manifold; 89% of variance captured by the first 8 principal components.",
        details: [
          "Broken-stick analysis identified 8 significant PCs (p < 0.05), with the first 3 PCs explaining 52% of total variance.",
          "PC1 corresponds to global firing rate modulation; PC2 captures a dorso-ventral gradient; PC3 isolates burst-associated activity.",
          "Neural trajectories during stimulus presentation form distinct closed loops in PC1\u2013PC3 space, suggesting repeatable stimulus encoding.",
          "Cross-validated reconstruction error: 4.7% for an 8-dimensional embedding, compared to 18.3% for a 3-dimensional embedding.",
          "t-SNE visualization of 8-PC embeddings reveals 4 distinct clusters corresponding to behavioral states.",
        ],
        metrics: [
          { label: "Significant PCs", value: "8" },
          { label: "Variance (top 3)", value: "52%" },
          { label: "Variance (top 8)", value: "89%" },
          { label: "Recon. Error (8-D)", value: "4.7%" },
          { label: "Clusters Found", value: "4" },
        ],
      },
      {
        type: "Cross-Correlation",
        icon: GitBranch,
        summary:
          "Identified 12 statistically significant functional connectivity pairs with predominant feedforward directionality.",
        details: [
          "Of 1,081 tested pairs, 12 exhibited significant short-latency peaks (< 5 ms) after jitter correction (p < 0.001, Bonferroni-corrected).",
          "8 of 12 pairs showed asymmetric cross-correlograms consistent with monosynaptic excitatory connections.",
          "Mean connection latency: 1.8 ms (SD = 0.4 ms), consistent with monosynaptic transmission.",
          "Functional connectivity graph has a small-world topology (\u03C3 = 2.4, compared to random networks).",
          "Putative inhibitory connections (2 pairs) exhibited troughs at 1\u20133 ms lag with suppression lasting 8\u201312 ms.",
        ],
        metrics: [
          { label: "Sig. Pairs", value: "12 / 1,081" },
          { label: "Excitatory", value: "8" },
          { label: "Inhibitory", value: "2" },
          { label: "Unclassified", value: "2" },
          { label: "Mean Latency", value: "1.8 ms" },
        ],
      },
      {
        type: "ISI Analysis",
        icon: Timer,
        summary:
          "Inter-spike interval analysis reveals predominantly Poisson-like firing with a subset of 8 bursty units (CV > 1.5).",
        details: [
          "Population median ISI: 28.3 ms (IQR: 14.7\u201358.2 ms), corresponding to a median firing rate of 35.3 Hz.",
          "39 of 47 units exhibited CV values between 0.8 and 1.2, consistent with irregular (Poisson-like) discharge.",
          "8 units (17%) were classified as bursty (CV > 1.5), with 6 being fast-spiking putative interneurons.",
          "Local variation (LV) analysis confirmed that firing irregularity was intrinsic rather than rate-dependent (mean LV = 0.98 \u00B1 0.12).",
          "ISI return maps for bursty units revealed clear intra-burst ISI clusters at 3\u20135 ms, well-separated from inter-burst intervals of 50\u2013200 ms.",
        ],
        metrics: [
          { label: "Median ISI", value: "28.3 ms" },
          { label: "Mean CV", value: "1.02 \u00B1 0.18" },
          { label: "Bursty Units", value: "8 (17%)" },
          { label: "Mean LV", value: "0.98 \u00B1 0.12" },
          { label: "Intra-burst ISI", value: "3\u20135 ms" },
        ],
      },
      {
        type: "Spectral Analysis",
        icon: AudioWaveform,
        summary:
          "Prominent theta (6\u20138 Hz) and gamma (30\u201380 Hz) oscillations with significant theta-gamma phase-amplitude coupling.",
        details: [
          "Theta power peaked at 7.2 Hz with a bandwidth of 1.4 Hz; gamma power showed two sub-bands: low-gamma (32\u201350 Hz) and high-gamma (60\u201380 Hz).",
          "Theta-gamma modulation index (MI) = 0.023 (p < 0.01, surrogate test), indicating significant cross-frequency coupling.",
          "Gamma amplitude was preferentially locked to the ascending phase of theta (\u03B8 \u2248 \u221260\u00B0), consistent with reports in hippocampal circuits.",
          "During stimulus presentation, gamma power increased by 2.3 dB relative to baseline (paired t-test, p < 0.001) while theta power remained stable.",
          "Sharp-wave ripple events (150\u2013250 Hz, 30\u201380 ms duration) were detected at a rate of 0.12 Hz during quiescent periods, each co-occurring with population burst events.",
        ],
        metrics: [
          { label: "Theta Peak", value: "7.2 Hz" },
          { label: "Gamma Bands", value: "32\u201350 / 60\u201380 Hz" },
          { label: "PAC (MI)", value: "0.023" },
          { label: "Stimulus \u0394 Gamma", value: "+2.3 dB" },
          { label: "Ripple Rate", value: "0.12 Hz" },
        ],
      },
    ],

    discussion: [
      "The combined analytical pipeline provides converging evidence for a hierarchically organized neural circuit " +
        "with distinct functional sub-populations. The identification of 47 well-isolated units with clear regular-spiking " +
        "and fast-spiking sub-classes is consistent with the canonical cortical microcircuit model.",
      "The low dimensionality of population activity (8 significant PCs capturing 89% of variance) suggests that " +
        "the recorded neural population operates within a constrained dynamical regime. The presence of closed trajectories " +
        "in PC space during stimulus presentation implies reliable and repeatable population coding.",
      "Cross-correlation analysis reveals sparse but structured connectivity, with a small-world topology " +
        "that may support efficient information routing. The predominance of short-latency excitatory connections " +
        "is consistent with local recurrent circuitry, while the identified inhibitory pairs may represent " +
        "feedback inhibition from fast-spiking interneurons.",
      "The significant theta-gamma phase-amplitude coupling, combined with the observation that gamma amplitude " +
        "is locked to the ascending theta phase, is consistent with the communication-through-coherence hypothesis " +
        "(Fries, 2015) and supports the view that theta oscillations provide temporal windows for gamma-mediated " +
        "information transfer.",
      "The detection of sharp-wave ripple events during quiescence, co-occurring with network bursts, " +
        "suggests memory consolidation-related replay activity. This is further supported by the observation that " +
        "burst initiation is spatially concentrated in the dorsal electrode quadrant, which may correspond to " +
        "a replay initiation zone.",
      "A notable limitation is that the current analysis treats all sessions uniformly. Future work should " +
        "incorporate session-by-session drift tracking and day-over-day stability metrics to assess " +
        "chronic recording reliability. Additionally, closed-loop experiments could test the causal role " +
        "of identified theta-gamma coupling in task performance.",
    ],

    conclusions: [
      "The experiment successfully captured high-quality multi-electrode recordings with stable unit yields across sessions.",
      "47 single units were isolated with high confidence (isolation distance > 15, ISI violation < 1%), " +
        "comprising 31 regular-spiking and 16 fast-spiking cells.",
      "Population dynamics are low-dimensional (8 PCs explain 89% of variance), with distinct neural trajectories " +
        "for different stimulus conditions.",
      "Functional connectivity is sparse (12 significant pairs from 1,081 tested) but exhibits small-world topology, " +
        "suggesting efficient information routing.",
      "Prominent theta-gamma cross-frequency coupling (MI = 0.023) provides evidence for oscillation-mediated " +
        "information transfer within the recorded circuit.",
      "Network burst events (0.34 Hz) show high recruitment (>15 units in 68% of events) and co-occur with " +
        "sharp-wave ripples, implicating these events in offline memory consolidation processes.",
    ],

    recommendations: [
      "Extend recording duration to 60+ minutes per session to improve statistical power for rare events " +
        "(sharp-wave ripples, high-order burst sequences).",
      "Implement real-time spike sorting (e.g., Kilosort online mode) to enable closed-loop perturbation " +
        "of identified neural ensembles during theta-gamma coupling episodes.",
      "Add optogenetic tagging to definitively classify cell types beyond waveform-based heuristics.",
      "Incorporate behavioral tracking (position, velocity, head direction) to map neural activity onto " +
        "spatial and task-related variables, enabling place field and grid cell analyses.",
      "Deploy Bayesian decoding models (e.g., population vector analysis, hidden Markov models) to assess " +
        "real-time neural state estimation accuracy and its dependence on ensemble size.",
      "Consider silicon probe designs with higher channel counts (e.g., Neuropixels 2.0, 384 channels) " +
        "to improve coverage of deep cortical layers and enable laminar profile analysis.",
      "Perform longitudinal stability analysis across weeks to evaluate chronic implant viability " +
        "and unit tracking fidelity for long-term studies.",
    ],

    references: [
      "Siegle, J. H., et al. (2021). Survey of spiking in the mouse visual system reveals functional hierarchy. Nature, 592, 86-92.",
      "Tort, A. B. L., Komorowski, R., Eichenbaum, H., & Kopell, N. (2010). Measuring phase-amplitude coupling between neuronal oscillations of different frequencies. J Neurophysiol, 104(2), 1195-1210.",
      "Fries, P. (2015). Rhythms for cognition: Communication through coherence. Neuron, 88(1), 220-235.",
      "Buzsáki, G. (2015). Hippocampal sharp wave-ripple: A cognitive biomarker for episodic memory and planning. Hippocampus, 25(10), 1073-1188.",
      "Légéndy, C. R., & Salcman, M. (1985). Bursts and recurrences of bursts in the spike trains of spontaneously active striate cortex neurons. J Neurophysiol, 53(4), 926-939.",
      "Pachitariu, M., et al. (2024). Spike sorting with Kilosort4. Nature Methods, 21, 914-921.",
      "Jun, J. J., et al. (2017). Fully integrated silicon probes for high-density recording of neural activity. Nature, 551, 232-236.",
    ],
  };
}

/* ─── Download Helpers ─── */

function generateMarkdown(report: GeneratedReport, data: ReportData): string {
  const hr = "\n\n---\n\n";
  let md = `# ${report.title}\n\n`;
  md += `**Principal Investigator:** ${data.pi}  \n`;
  md += `**Institution:** ${data.institution}  \n`;
  md += `**Department:** ${data.department}  \n`;
  md += `**Date:** ${report.createdAt}  \n`;
  md += `**Recordings:** ${report.recordingCount} | **Analyses:** ${report.analysisCount}\n`;
  md += hr;

  md += `## Abstract\n\n${data.abstract}\n`;
  md += hr;

  md += `## Executive Summary\n\n${data.executiveSummary}\n`;
  md += hr;

  md += `## Methodology\n\n`;
  data.methodology.forEach((p, i) => { md += `${i + 1}. ${p}\n\n`; });
  md += hr;

  md += `## Data Acquisition\n\n${data.dataAcquisition.overview}\n\n`;
  md += `| Recording | Date | Duration | Channels | Sampling Rate | Size |\n`;
  md += `|-----------|------|----------|----------|---------------|------|\n`;
  data.dataAcquisition.recordings.forEach((r) => {
    md += `| ${r.name} | ${r.date} | ${r.duration} | ${r.channels} | ${r.samplingRate} | ${r.sizeGb} GB |\n`;
  });
  md += hr;

  md += `## Analysis Results\n\n`;
  data.analyses.forEach((a) => {
    md += `### ${a.type}\n\n`;
    md += `**Summary:** ${a.summary}\n\n`;
    md += `**Key Metrics:**\n\n`;
    a.metrics.forEach((m) => { md += `- **${m.label}:** ${m.value}\n`; });
    md += `\n**Detailed Findings:**\n\n`;
    a.details.forEach((d) => { md += `- ${d}\n`; });
    md += "\n";
  });
  md += hr;

  md += `## Discussion\n\n`;
  data.discussion.forEach((p) => { md += `${p}\n\n`; });
  md += hr;

  md += `## Conclusions\n\n`;
  data.conclusions.forEach((c, i) => { md += `${i + 1}. ${c}\n\n`; });
  md += hr;

  md += `## Recommendations\n\n`;
  data.recommendations.forEach((r, i) => { md += `${i + 1}. ${r}\n\n`; });
  md += hr;

  md += `## References\n\n`;
  data.references.forEach((r, i) => { md += `${i + 1}. ${r}\n`; });

  return md;
}

function generateHTML(report: GeneratedReport, data: ReportData): string {
  const css = `
    body { font-family: 'Georgia', 'Times New Roman', serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.7; }
    h1 { font-size: 1.8em; border-bottom: 3px solid #1a237e; padding-bottom: 12px; color: #1a237e; }
    h2 { font-size: 1.3em; color: #283593; margin-top: 2em; border-bottom: 1px solid #c5cae9; padding-bottom: 6px; }
    h3 { font-size: 1.1em; color: #3949ab; }
    .meta { color: #555; font-size: 0.9em; margin-bottom: 1.5em; }
    .metric-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; margin: 12px 0; }
    .metric-card { background: #e8eaf6; border-radius: 6px; padding: 8px 12px; }
    .metric-label { font-size: 0.8em; color: #5c6bc0; font-weight: 600; }
    .metric-value { font-size: 1.05em; font-weight: 700; color: #1a237e; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #c5cae9; padding: 8px 12px; text-align: left; font-size: 0.9em; }
    th { background: #e8eaf6; font-weight: 600; }
    ol, ul { margin: 8px 0; padding-left: 24px; }
    li { margin: 4px 0; }
    .page-break { page-break-before: always; }
    @media print { body { margin: 0; padding: 20px; } h2 { page-break-after: avoid; } }
  `;

  let html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">`;
  html += `<title>${report.title}</title><style>${css}</style></head><body>`;
  html += `<h1>${report.title}</h1>`;
  html += `<div class="meta"><strong>PI:</strong> ${data.pi} &mdash; ${data.institution}, ${data.department}<br>`;
  html += `<strong>Generated:</strong> ${report.createdAt} | <strong>Recordings:</strong> ${report.recordingCount} | <strong>Analyses:</strong> ${report.analysisCount}</div>`;

  html += `<h2>Abstract</h2><p>${data.abstract}</p>`;
  html += `<h2>Executive Summary</h2><p>${data.executiveSummary}</p>`;

  html += `<h2>Methodology</h2><ol>`;
  data.methodology.forEach((p) => { html += `<li>${p}</li>`; });
  html += `</ol>`;

  html += `<h2>Data Acquisition</h2><p>${data.dataAcquisition.overview}</p>`;
  html += `<table><tr><th>Recording</th><th>Date</th><th>Duration</th><th>Channels</th><th>Sampling Rate</th><th>Size</th></tr>`;
  data.dataAcquisition.recordings.forEach((r) => {
    html += `<tr><td>${r.name}</td><td>${r.date}</td><td>${r.duration}</td><td>${r.channels}</td><td>${r.samplingRate}</td><td>${r.sizeGb} GB</td></tr>`;
  });
  html += `</table>`;

  html += `<h2 class="page-break">Analysis Results</h2>`;
  data.analyses.forEach((a) => {
    html += `<h3>${a.type}</h3><p><strong>Summary:</strong> ${a.summary}</p>`;
    html += `<div class="metric-grid">`;
    a.metrics.forEach((m) => {
      html += `<div class="metric-card"><div class="metric-label">${m.label}</div><div class="metric-value">${m.value}</div></div>`;
    });
    html += `</div><ul>`;
    a.details.forEach((d) => { html += `<li>${d}</li>`; });
    html += `</ul>`;
  });

  html += `<h2 class="page-break">Discussion</h2>`;
  data.discussion.forEach((p) => { html += `<p>${p}</p>`; });

  html += `<h2>Conclusions</h2><ol>`;
  data.conclusions.forEach((c) => { html += `<li>${c}</li>`; });
  html += `</ol>`;

  html += `<h2>Recommendations</h2><ol>`;
  data.recommendations.forEach((r) => { html += `<li>${r}</li>`; });
  html += `</ol>`;

  html += `<h2>References</h2><ol>`;
  data.references.forEach((r) => { html += `<li>${r}</li>`; });
  html += `</ol>`;

  html += `</body></html>`;
  return html;
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Component ─── */

export default function ReportViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);

  const report = useMemo(() => loadReports().find((r) => r.id === id), [id]);
  const data = useMemo(() => (report ? getReportData(report) : null), [report]);

  if (!report || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <FileText className="w-12 h-12 text-neural-text-muted" />
        <p className="text-neural-text-muted">Report not found</p>
        <button onClick={() => navigate("/reports")} className="text-sm text-neural-accent-cyan hover:underline">
          Back to Reports
        </button>
      </div>
    );
  }

  const slug = report.experimentName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  const handleDownload = (format: "pdf" | "html" | "md" | "docx") => {
    if (format === "pdf") {
      window.print();
      return;
    }
    if (format === "md") {
      downloadFile(`${slug}-report.md`, generateMarkdown(report, data), "text/markdown");
      return;
    }
    const htmlContent = generateHTML(report, data);
    if (format === "html") {
      downloadFile(`${slug}-report.html`, htmlContent, "text/html");
      return;
    }
    /* Word (.doc) — HTML-in-Word format */
    const wordContent =
      `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
      `<head><meta charset="utf-8"><title>${report.title}</title>` +
      `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->` +
      `</head><body>` +
      htmlContent.replace(/<!DOCTYPE.*?<body>/s, "").replace(/<\/body><\/html>/, "") +
      `</body></html>`;
    downloadFile(`${slug}-report.doc`, wordContent, "application/msword");
  };

  /* ─── Section renderer helper ─── */
  const SectionTitle = ({ children, id: sId }: { children: React.ReactNode; id?: string }) => (
    <h2 id={sId} className="text-base font-bold text-neural-accent-cyan mt-8 mb-3 flex items-center gap-2 border-b border-neural-border pb-2">
      {children}
    </h2>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Sticky toolbar */}
      <div className="flex items-center justify-between bg-neural-surface rounded-xl border border-neural-border p-3 mb-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/reports")}
            className="p-1.5 rounded-lg hover:bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary neural-transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-neural-accent-green" />
              <span className="text-sm font-semibold text-neural-text-primary">{report.title}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-neural-text-muted mt-0.5">
              <span className="flex items-center gap-1"><FlaskConical className="w-3 h-3" />{report.experimentName}</span>
              <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{report.recordingCount} recordings</span>
              <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" />{report.analysisCount} analyses</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{report.createdAt}</span>
            </div>
          </div>
        </div>

        {/* Download buttons */}
        <div className="flex items-center gap-2">
          <button onClick={() => handleDownload("pdf")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-neural-accent-red/10 text-neural-accent-red border border-neural-accent-red/20 hover:bg-neural-accent-red/20 neural-transition">
            <Printer className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={() => handleDownload("html")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-neural-accent-cyan/10 text-neural-accent-cyan border border-neural-accent-cyan/20 hover:bg-neural-accent-cyan/20 neural-transition">
            <FileDown className="w-3.5 h-3.5" /> HTML
          </button>
          <button onClick={() => handleDownload("md")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-neural-accent-green/10 text-neural-accent-green border border-neural-accent-green/20 hover:bg-neural-accent-green/20 neural-transition">
            <FileText className="w-3.5 h-3.5" /> Markdown
          </button>
          <button onClick={() => handleDownload("docx")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-neural-accent-purple/10 text-neural-accent-purple border border-neural-accent-purple/20 hover:bg-neural-accent-purple/20 neural-transition">
            <Download className="w-3.5 h-3.5" /> Word
          </button>
        </div>
      </div>

      {/* Report body */}
      <div ref={printRef} className="flex-1 overflow-y-auto bg-neural-surface rounded-xl border border-neural-border p-6 print:border-0 print:rounded-none print:p-0">
        {/* Title block */}
        <div className="text-center mb-8 pb-6 border-b border-neural-border">
          <Brain className="w-10 h-10 text-neural-accent-cyan mx-auto mb-3" />
          <h1 className="text-xl font-bold text-neural-text-primary mb-2">{report.title}</h1>
          <p className="text-sm text-neural-text-secondary">{data.pi}</p>
          <p className="text-xs text-neural-text-muted">{data.institution} &mdash; {data.department}</p>
          <p className="text-xs text-neural-text-muted mt-2">Generated: {report.createdAt}</p>
          <div className="flex items-center justify-center gap-4 mt-3 text-xs text-neural-text-muted">
            <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{report.recordingCount} Recordings</span>
            <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" />{report.analysisCount} Analysis Types</span>
          </div>
        </div>

        {/* Table of Contents */}
        <div className="mb-8 p-4 rounded-lg bg-neural-surface-alt border border-neural-border">
          <h3 className="text-xs font-bold text-neural-text-secondary uppercase tracking-wider mb-2">Table of Contents</h3>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {["abstract", "executive-summary", "methodology", "data-acquisition", "analysis-results", "discussion", "conclusions", "recommendations", "references"].map((s) => (
              <a key={s} href={`#${s}`} className="text-neural-accent-cyan hover:underline capitalize py-0.5">
                {s.replace(/-/g, " ")}
              </a>
            ))}
          </div>
        </div>

        {/* Abstract */}
        <SectionTitle id="abstract">Abstract</SectionTitle>
        <p className="text-sm text-neural-text-secondary leading-relaxed">{data.abstract}</p>

        {/* Executive Summary */}
        <SectionTitle id="executive-summary">Executive Summary</SectionTitle>
        <div className="p-4 rounded-lg bg-neural-accent-cyan/5 border border-neural-accent-cyan/10">
          <p className="text-sm text-neural-text-secondary leading-relaxed">{data.executiveSummary}</p>
        </div>

        {/* Methodology */}
        <SectionTitle id="methodology">Methodology</SectionTitle>
        <ol className="space-y-3 ml-4">
          {data.methodology.map((step, i) => (
            <li key={i} className="text-sm text-neural-text-secondary leading-relaxed">
              <span className="text-neural-accent-cyan font-mono mr-2">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>

        {/* Data Acquisition */}
        <SectionTitle id="data-acquisition">Data Acquisition</SectionTitle>
        <p className="text-sm text-neural-text-secondary leading-relaxed mb-4">{data.dataAcquisition.overview}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-neural-surface-alt">
                <th className="text-left p-2 border border-neural-border text-neural-text-secondary font-semibold">Recording</th>
                <th className="text-left p-2 border border-neural-border text-neural-text-secondary font-semibold">Date</th>
                <th className="text-left p-2 border border-neural-border text-neural-text-secondary font-semibold">Duration</th>
                <th className="text-left p-2 border border-neural-border text-neural-text-secondary font-semibold">Channels</th>
                <th className="text-left p-2 border border-neural-border text-neural-text-secondary font-semibold">Sampling Rate</th>
                <th className="text-left p-2 border border-neural-border text-neural-text-secondary font-semibold">Size</th>
              </tr>
            </thead>
            <tbody>
              {data.dataAcquisition.recordings.map((rec) => (
                <tr key={rec.id} className="hover:bg-neural-surface-alt/50 neural-transition">
                  <td className="p-2 border border-neural-border text-neural-text-primary font-medium">{rec.name}</td>
                  <td className="p-2 border border-neural-border text-neural-text-muted">{rec.date}</td>
                  <td className="p-2 border border-neural-border text-neural-text-muted">{rec.duration}</td>
                  <td className="p-2 border border-neural-border text-neural-text-muted">{rec.channels}</td>
                  <td className="p-2 border border-neural-border text-neural-text-muted">{rec.samplingRate}</td>
                  <td className="p-2 border border-neural-border text-neural-text-muted">{rec.sizeGb} GB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Analysis Results */}
        <SectionTitle id="analysis-results">Analysis Results</SectionTitle>
        <div className="space-y-6">
          {data.analyses.map((analysis) => {
            const Icon = analysis.icon;
            return (
              <div key={analysis.type} className="p-4 rounded-lg bg-neural-surface-alt border border-neural-border">
                {/* Analysis header */}
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-5 h-5 text-neural-accent-cyan" />
                  <h3 className="text-sm font-bold text-neural-text-primary">{analysis.type}</h3>
                </div>

                {/* Summary */}
                <p className="text-sm text-neural-text-secondary mb-3 italic">{analysis.summary}</p>

                {/* Metrics grid */}
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {analysis.metrics.map((m) => (
                    <div key={m.label} className="p-2 rounded bg-neural-surface border border-neural-border text-center">
                      <div className="text-[10px] text-neural-text-muted uppercase tracking-wider">{m.label}</div>
                      <div className="text-sm font-bold text-neural-accent-cyan mt-0.5">{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Detailed findings */}
                <ul className="space-y-1.5">
                  {analysis.details.map((detail, i) => (
                    <li key={i} className="text-xs text-neural-text-secondary leading-relaxed flex items-start gap-2">
                      <span className="text-neural-accent-cyan mt-1 shrink-0">&bull;</span>
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Discussion */}
        <SectionTitle id="discussion">Discussion</SectionTitle>
        <div className="space-y-3">
          {data.discussion.map((para, i) => (
            <p key={i} className="text-sm text-neural-text-secondary leading-relaxed">{para}</p>
          ))}
        </div>

        {/* Conclusions */}
        <SectionTitle id="conclusions">Conclusions</SectionTitle>
        <ol className="space-y-2 ml-4">
          {data.conclusions.map((c, i) => (
            <li key={i} className="text-sm text-neural-text-secondary leading-relaxed">
              <span className="text-neural-accent-green font-mono mr-2">{i + 1}.</span>
              {c}
            </li>
          ))}
        </ol>

        {/* Recommendations */}
        <SectionTitle id="recommendations">Recommendations</SectionTitle>
        <ol className="space-y-2 ml-4">
          {data.recommendations.map((r, i) => (
            <li key={i} className="text-sm text-neural-text-secondary leading-relaxed">
              <span className="text-neural-accent-amber font-mono mr-2">{i + 1}.</span>
              {r}
            </li>
          ))}
        </ol>

        {/* References */}
        <SectionTitle id="references">References</SectionTitle>
        <ol className="space-y-1 ml-4">
          {data.references.map((ref, i) => (
            <li key={i} className="text-xs text-neural-text-muted leading-relaxed">
              <span className="font-mono mr-1">[{i + 1}]</span> {ref}
            </li>
          ))}
        </ol>

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-neural-border text-center">
          <p className="text-[10px] text-neural-text-muted">
            This report was generated by the CNEAv5 AI-Assisted Analysis Engine. All statistical claims are derived from
            automated analysis pipelines and should be verified by the principal investigator before publication.
          </p>
          <p className="text-[10px] text-neural-text-muted mt-1">
            &copy; {new Date().getFullYear()} {data.institution} &mdash; {data.department}
          </p>
        </div>
      </div>
    </div>
  );
}
