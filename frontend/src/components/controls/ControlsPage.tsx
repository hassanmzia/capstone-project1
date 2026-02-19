import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "@/store";
import {
  setBiasParams,
  setClockConfig,
  setTiaConfig,
  setGainMode,
  setStimulationConfig,
  setPixelConfig,
  setFullConfig,
  markSynced,
  resetConfig,
  setActivePreset,
} from "@/store/slices/configSlice";
import type {
  GainMode,
  BiasParams,
  ClockConfig,
  TiaConfig,
  StimulationConfig,
  PixelConfig,
} from "@/types/neural";
import {
  SlidersHorizontal,
  Clock,
  Radio,
  TrendingUp,
  Zap,
  Grid3X3,
  Save,
  RotateCcw,
  Upload,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";

/* ─── Tabs ─── */

const tabs = [
  { id: "bias", label: "Bias Config", icon: SlidersHorizontal },
  { id: "clock", label: "Clock", icon: Clock },
  { id: "tia", label: "TIA", icon: Radio },
  { id: "gain", label: "Gain Mode", icon: TrendingUp },
  { id: "stim", label: "Stimulation", icon: Zap },
  { id: "pixel", label: "Pixel/Array", icon: Grid3X3 },
] as const;

type TabId = (typeof tabs)[number]["id"];

/* ─── Preset definitions ─── */

interface PresetDef {
  id: string;
  name: string;
  description: string;
  bias: BiasParams;
  clock: ClockConfig;
  tia: TiaConfig;
  gainMode: GainMode;
  stimulation: StimulationConfig;
  pixel: PixelConfig;
}

const defaultBias: BiasParams = {
  vRefP: 1.2, vRefN: 0.4, biasCasc: 0.8, biasInp: 0.5, biasOta: 0.6,
  biasDiffamp: 0.7, biasBuf: 0.5, biasComp: 0.6, biasThreshold: 0.5,
  biasRef: 0.8, biasSf: 0.5, biasCalp: 0.3, biasCaln: 0.3, biasStim: 0.0,
  biasReset: 0.5, biasPga: 0.6, biasAdc: 0.7, biasDac: 0.5, biasLvds: 0.6,
  biasPad: 0.4,
};

const defaultClock: ClockConfig = {
  masterClockMhz: 50, adcClockDiv: 4, pixelClockDiv: 2, stimClockDiv: 8,
  pllEnabled: true, pllMultiplier: 2, phaseOffset: 0,
};

const defaultTia: TiaConfig = {
  gain: 1000, bandwidth: 10000, inputBias: 0.5,
  feedbackResistance: 100000, filterOrder: 2, cutoffFrequency: 5000,
};

const defaultStim: StimulationConfig = {
  enabled: false, channels: [], waveform: "biphasic",
  amplitudeUa: 10, pulseDurationUs: 200, frequencyHz: 100,
  trainDurationMs: 1000, interPhaseDelayUs: 50,
};

const defaultPixel: PixelConfig = {
  arrayRows: 64, arrayCols: 64, activePixels: [],
  readoutOrder: "sequential", roiStartRow: 0, roiStartCol: 0,
  roiEndRow: 63, roiEndCol: 63,
};

const presets: PresetDef[] = [
  {
    id: "default",
    name: "Default",
    description: "Balanced settings for general-purpose recording",
    bias: defaultBias,
    clock: defaultClock,
    tia: defaultTia,
    gainMode: "high",
    stimulation: defaultStim,
    pixel: defaultPixel,
  },
  {
    id: "high-density",
    name: "High Density",
    description: "Full 64x64 array, fast readout, high bandwidth",
    bias: { ...defaultBias, biasOta: 0.9, biasBuf: 0.8, biasPga: 0.9, biasAdc: 0.9 },
    clock: { masterClockMhz: 100, adcClockDiv: 2, pixelClockDiv: 1, stimClockDiv: 8, pllEnabled: true, pllMultiplier: 4, phaseOffset: 0 },
    tia: { gain: 500, bandwidth: 50000, inputBias: 0.5, feedbackResistance: 50000, filterOrder: 4, cutoffFrequency: 20000 },
    gainMode: "medium",
    stimulation: defaultStim,
    pixel: { arrayRows: 64, arrayCols: 64, activePixels: [], readoutOrder: "sequential", roiStartRow: 0, roiStartCol: 0, roiEndRow: 63, roiEndCol: 63 },
  },
  {
    id: "low-noise",
    name: "Low Noise",
    description: "Optimised for single-unit recording, lower bandwidth",
    bias: { ...defaultBias, vRefP: 1.5, vRefN: 0.3, biasInp: 0.3, biasOta: 0.4, biasDiffamp: 0.5, biasComp: 0.4, biasThreshold: 0.35, biasPga: 0.4 },
    clock: { masterClockMhz: 30, adcClockDiv: 8, pixelClockDiv: 4, stimClockDiv: 16, pllEnabled: true, pllMultiplier: 1, phaseOffset: 0 },
    tia: { gain: 5000, bandwidth: 6000, inputBias: 0.4, feedbackResistance: 500000, filterOrder: 4, cutoffFrequency: 3000 },
    gainMode: "ultra",
    stimulation: defaultStim,
    pixel: { arrayRows: 64, arrayCols: 64, activePixels: [], readoutOrder: "roi", roiStartRow: 16, roiStartCol: 16, roiEndRow: 47, roiEndCol: 47 },
  },
  {
    id: "stimulation",
    name: "Stimulation",
    description: "Pre-configured for biphasic stimulation experiments",
    bias: { ...defaultBias, biasStim: 1.2, biasComp: 0.8, biasThreshold: 0.7 },
    clock: { masterClockMhz: 50, adcClockDiv: 4, pixelClockDiv: 2, stimClockDiv: 2, pllEnabled: true, pllMultiplier: 2, phaseOffset: 0 },
    tia: defaultTia,
    gainMode: "high",
    stimulation: { enabled: true, channels: [0, 1, 2, 3], waveform: "biphasic", amplitudeUa: 50, pulseDurationUs: 400, frequencyHz: 200, trainDurationMs: 2000, interPhaseDelayUs: 100 },
    pixel: defaultPixel,
  },
];

/* ─── Bias parameter groups ─── */

interface BiasGroup {
  label: string;
  entries: [string, string, number, number, number, string][];
}

const biasGroups: BiasGroup[] = [
  {
    label: "Reference Voltages",
    entries: [
      ["vRefP", "V Ref Positive", 0, 3.3, 0.01, "V"],
      ["vRefN", "V Ref Negative", 0, 3.3, 0.01, "V"],
      ["biasRef", "Bias Reference", 0, 3.3, 0.01, "V"],
    ],
  },
  {
    label: "Amplifier Biases",
    entries: [
      ["biasCasc", "Bias Cascode", 0, 3.3, 0.01, "V"],
      ["biasInp", "Bias Input", 0, 3.3, 0.01, "V"],
      ["biasOta", "Bias OTA", 0, 3.3, 0.01, "V"],
      ["biasDiffamp", "Bias Diff Amp", 0, 3.3, 0.01, "V"],
      ["biasBuf", "Bias Buffer", 0, 3.3, 0.01, "V"],
      ["biasSf", "Bias Source Follower", 0, 3.3, 0.01, "V"],
    ],
  },
  {
    label: "Comparator & Threshold",
    entries: [
      ["biasComp", "Bias Comparator", 0, 3.3, 0.01, "V"],
      ["biasThreshold", "Bias Threshold", 0, 3.3, 0.01, "V"],
    ],
  },
  {
    label: "Data Converters",
    entries: [
      ["biasPga", "Bias PGA", 0, 3.3, 0.01, "V"],
      ["biasAdc", "Bias ADC", 0, 3.3, 0.01, "V"],
      ["biasDac", "Bias DAC", 0, 3.3, 0.01, "V"],
    ],
  },
  {
    label: "Calibration & Stimulation",
    entries: [
      ["biasCalp", "Bias Cal Positive", 0, 3.3, 0.01, "V"],
      ["biasCaln", "Bias Cal Negative", 0, 3.3, 0.01, "V"],
      ["biasStim", "Bias Stimulation", 0, 3.3, 0.01, "V"],
    ],
  },
  {
    label: "I/O & Power",
    entries: [
      ["biasReset", "Bias Reset", 0, 3.3, 0.01, "V"],
      ["biasLvds", "Bias LVDS", 0, 3.3, 0.01, "V"],
      ["biasPad", "Bias Pad", 0, 3.3, 0.01, "V"],
    ],
  },
];

/* ─── Param slider component ─── */

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-4 py-2">
      <label className="text-sm text-neural-text-secondary w-40 shrink-0">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1.5 rounded-full appearance-none bg-neural-border-bright accent-neural-accent-cyan"
      />
      <span className="text-sm font-mono text-neural-text-primary w-20 text-right">
        {value.toFixed(step < 1 ? 2 : 0)} {unit}
      </span>
    </div>
  );
}

/* ─── Info chip for computed values ─── */

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neural-surface-alt border border-neural-border text-xs">
      <span className="text-neural-text-muted">{label}:</span>
      <span className="font-mono text-neural-accent-cyan font-semibold">{value}</span>
    </div>
  );
}

/* ─── Main component ─── */

export default function ControlsPage() {
  const dispatch = useDispatch();
  const config = useSelector((state: RootState) => state.config);
  const [activeTab, setActiveTab] = useState<TabId>("bias");
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [applyToast, setApplyToast] = useState(false);
  const presetMenuRef = useRef<HTMLDivElement>(null);

  // Close preset menu on click outside
  useEffect(() => {
    if (!showPresetMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) {
        setShowPresetMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPresetMenu]);

  // Auto-dismiss apply toast
  useEffect(() => {
    if (!applyToast) return;
    const t = setTimeout(() => setApplyToast(false), 2000);
    return () => clearTimeout(t);
  }, [applyToast]);

  const handleLoadPreset = useCallback(
    (preset: PresetDef) => {
      dispatch(setActivePreset(preset.id));
      dispatch(
        setFullConfig({
          bias: preset.bias,
          clock: preset.clock,
          tia: preset.tia,
          gainMode: preset.gainMode,
          stimulation: preset.stimulation,
          pixel: preset.pixel,
        })
      );
      setShowPresetMenu(false);
    },
    [dispatch]
  );

  const handleApply = useCallback(() => {
    dispatch(markSynced());
    setApplyToast(true);
  }, [dispatch]);

  // Computed values for clock tab
  const effectiveAdcRate = useMemo(
    () => (config.clock.masterClockMhz * (config.clock.pllEnabled ? config.clock.pllMultiplier : 1)) / config.clock.adcClockDiv,
    [config.clock]
  );

  const effectivePixelRate = useMemo(
    () => (config.clock.masterClockMhz * (config.clock.pllEnabled ? config.clock.pllMultiplier : 1)) / config.clock.pixelClockDiv,
    [config.clock]
  );

  // Computed values for pixel tab
  const roiPixelCount = useMemo(() => {
    const rows = Math.max(0, config.pixel.roiEndRow - config.pixel.roiStartRow + 1);
    const cols = Math.max(0, config.pixel.roiEndCol - config.pixel.roiStartCol + 1);
    return rows * cols;
  }, [config.pixel]);

  const totalPixels = config.pixel.arrayRows * config.pixel.arrayCols;

  // Stim channels toggle
  const stimChannelCount = 64;
  const handleToggleStimChannel = useCallback(
    (ch: number) => {
      const current = config.stimulation.channels;
      const next = current.includes(ch)
        ? current.filter((c) => c !== ch)
        : [...current, ch].sort((a, b) => a - b);
      dispatch(setStimulationConfig({ channels: next }));
    },
    [config.stimulation.channels, dispatch]
  );

  const handleSelectAllStimChannels = useCallback(() => {
    dispatch(setStimulationConfig({ channels: Array.from({ length: stimChannelCount }, (_, i) => i) }));
  }, [dispatch]);

  const handleClearStimChannels = useCallback(() => {
    dispatch(setStimulationConfig({ channels: [] }));
  }, [dispatch]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Tabs + toolbar */}
      <div className="flex items-center gap-1 bg-neural-surface rounded-xl border border-neural-border p-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium neural-transition ${
              activeTab === id
                ? "bg-neural-accent-cyan/15 text-neural-accent-cyan"
                : "text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Apply toast */}
        {applyToast && (
          <div className="flex items-center gap-1.5 text-xs text-neural-accent-green mr-2 animate-pulse">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Configuration applied</span>
          </div>
        )}

        {/* Dirty indicator */}
        {config.isDirty && !applyToast && (
          <div className="flex items-center gap-1.5 text-xs text-neural-accent-amber mr-2">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Unsaved changes</span>
          </div>
        )}

        {/* Active preset badge */}
        {config.activePreset && !config.isDirty && !applyToast && (
          <div className="flex items-center gap-1 text-xs text-neural-text-muted mr-2">
            <Info className="w-3 h-3" />
            <span>Preset: <span className="text-neural-accent-cyan">{presets.find((p) => p.id === config.activePreset)?.name ?? config.activePreset}</span></span>
          </div>
        )}

        {/* Preset dropdown */}
        <div className="relative" ref={presetMenuRef}>
          <button
            onClick={() => setShowPresetMenu(!showPresetMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border border-neural-border neural-transition"
          >
            <Upload className="w-4 h-4" />
            Load Preset
          </button>
          {showPresetMenu && (
            <div className="absolute top-full right-0 mt-1 w-64 bg-neural-surface border border-neural-border rounded-lg shadow-xl z-50 py-1">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleLoadPreset(p)}
                  className={`w-full text-left px-3 py-2 neural-transition hover:bg-neural-surface-alt ${
                    config.activePreset === p.id
                      ? "bg-neural-accent-cyan/5"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-neural-text-primary font-medium">{p.name}</span>
                    {config.activePreset === p.id && (
                      <CheckCircle2 className="w-3 h-3 text-neural-accent-cyan" />
                    )}
                  </div>
                  <p className="text-[11px] text-neural-text-muted mt-0.5">{p.description}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => dispatch(resetConfig())}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border border-neural-border neural-transition"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <button
          onClick={handleApply}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border border-neural-accent-cyan/30 neural-transition"
        >
          <Save className="w-4 h-4" />
          Apply
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 bg-neural-surface rounded-xl border border-neural-border p-6 overflow-y-auto">
        {/* ── Bias Configuration ── */}
        {activeTab === "bias" && (
          <div>
            <h2 className="text-lg font-semibold text-neural-text-primary mb-1">Bias Configuration</h2>
            <p className="text-sm text-neural-text-muted mb-6">
              Configure the 20 bias parameters for the neural amplifier array, organised by functional group.
            </p>
            <div className="space-y-6">
              {biasGroups.map((group) => (
                <div key={group.label}>
                  <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider mb-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-neural-accent-cyan" />
                    {group.label}
                  </h3>
                  <div className="space-y-0 divide-y divide-neural-border/50 bg-neural-surface-alt/30 rounded-lg px-4 border border-neural-border/50">
                    {group.entries.map(([key, label, min, max, step, unit]) => (
                      <ParamSlider
                        key={key}
                        label={label}
                        value={config.bias[key as keyof typeof config.bias]}
                        min={min}
                        max={max}
                        step={step}
                        unit={unit}
                        onChange={(v) => dispatch(setBiasParams({ [key]: v }))}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Clock Configuration ── */}
        {activeTab === "clock" && (
          <div>
            <h2 className="text-lg font-semibold text-neural-text-primary mb-1">Clock Configuration</h2>
            <p className="text-sm text-neural-text-muted mb-4">
              Configure master clock, dividers, and PLL settings.
            </p>

            {/* Computed rates */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <InfoChip label="Effective ADC Rate" value={`${effectiveAdcRate.toFixed(1)} MHz`} />
              <InfoChip label="Effective Pixel Rate" value={`${effectivePixelRate.toFixed(1)} MHz`} />
              <InfoChip label="PLL Output" value={`${(config.clock.masterClockMhz * (config.clock.pllEnabled ? config.clock.pllMultiplier : 1)).toFixed(0)} MHz`} />
            </div>

            <div className="space-y-1 divide-y divide-neural-border/50">
              <ParamSlider label="Master Clock" value={config.clock.masterClockMhz} min={1} max={200} step={1} unit="MHz" onChange={(v) => dispatch(setClockConfig({ masterClockMhz: v }))} />
              <ParamSlider label="ADC Clock Divider" value={config.clock.adcClockDiv} min={1} max={32} step={1} unit="x" onChange={(v) => dispatch(setClockConfig({ adcClockDiv: v }))} />
              <ParamSlider label="Pixel Clock Divider" value={config.clock.pixelClockDiv} min={1} max={32} step={1} unit="x" onChange={(v) => dispatch(setClockConfig({ pixelClockDiv: v }))} />
              <ParamSlider label="Stim Clock Divider" value={config.clock.stimClockDiv} min={1} max={64} step={1} unit="x" onChange={(v) => dispatch(setClockConfig({ stimClockDiv: v }))} />
              <ParamSlider label="PLL Multiplier" value={config.clock.pllMultiplier} min={1} max={16} step={1} unit="x" onChange={(v) => dispatch(setClockConfig({ pllMultiplier: v }))} />
              <ParamSlider label="Phase Offset" value={config.clock.phaseOffset} min={0} max={360} step={1} unit="deg" onChange={(v) => dispatch(setClockConfig({ phaseOffset: v }))} />
            </div>

            <div className="flex items-center gap-3 mt-6 p-4 bg-neural-surface-alt rounded-lg border border-neural-border">
              <label className="text-sm text-neural-text-secondary">PLL Enabled</label>
              <button
                onClick={() => dispatch(setClockConfig({ pllEnabled: !config.clock.pllEnabled }))}
                className={`w-10 h-5 rounded-full relative neural-transition ${
                  config.clock.pllEnabled ? "bg-neural-accent-cyan" : "bg-neural-border-bright"
                }`}
              >
                <div
                  className="w-4 h-4 rounded-full bg-white absolute top-0.5 neural-transition"
                  style={{ left: config.clock.pllEnabled ? "22px" : "2px" }}
                />
              </button>
              <span className={`text-xs ${config.clock.pllEnabled ? "text-neural-accent-cyan" : "text-neural-text-muted"}`}>
                {config.clock.pllEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        )}

        {/* ── TIA Configuration ── */}
        {activeTab === "tia" && (
          <div>
            <h2 className="text-lg font-semibold text-neural-text-primary mb-1">TIA Configuration</h2>
            <p className="text-sm text-neural-text-muted mb-6">
              Transimpedance amplifier settings for current-to-voltage conversion.
            </p>
            <div className="space-y-1 divide-y divide-neural-border/50">
              <ParamSlider label="Gain" value={config.tia.gain} min={100} max={10000} step={100} unit="V/A" onChange={(v) => dispatch(setTiaConfig({ gain: v }))} />
              <ParamSlider label="Bandwidth" value={config.tia.bandwidth} min={100} max={100000} step={100} unit="Hz" onChange={(v) => dispatch(setTiaConfig({ bandwidth: v }))} />
              <ParamSlider label="Input Bias" value={config.tia.inputBias} min={0} max={3.3} step={0.01} unit="V" onChange={(v) => dispatch(setTiaConfig({ inputBias: v }))} />
              <ParamSlider label="Feedback Resistance" value={config.tia.feedbackResistance} min={1000} max={1000000} step={1000} unit="Ohm" onChange={(v) => dispatch(setTiaConfig({ feedbackResistance: v }))} />
              <ParamSlider label="Filter Order" value={config.tia.filterOrder} min={1} max={8} step={1} unit="" onChange={(v) => dispatch(setTiaConfig({ filterOrder: v }))} />
              <ParamSlider label="Cutoff Frequency" value={config.tia.cutoffFrequency} min={100} max={50000} step={100} unit="Hz" onChange={(v) => dispatch(setTiaConfig({ cutoffFrequency: v }))} />
            </div>
          </div>
        )}

        {/* ── Gain Mode ── */}
        {activeTab === "gain" && (
          <div>
            <h2 className="text-lg font-semibold text-neural-text-primary mb-1">Gain Mode</h2>
            <p className="text-sm text-neural-text-muted mb-6">
              Select the amplifier gain mode for the electrode array.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(["low", "medium", "high", "ultra"] as GainMode[]).map((mode) => {
                const info = { low: { gain: "100x", noise: "~8 uV", bw: "Wide" }, medium: { gain: "500x", noise: "~5 uV", bw: "Medium" }, high: { gain: "1000x", noise: "~3 uV", bw: "Standard" }, ultra: { gain: "5000x", noise: "~1.5 uV", bw: "Narrow" } }[mode];
                return (
                  <button
                    key={mode}
                    onClick={() => dispatch(setGainMode(mode))}
                    className={`flex flex-col items-center gap-3 p-6 rounded-xl border neural-transition ${
                      config.gainMode === mode
                        ? "bg-neural-accent-cyan/10 border-neural-accent-cyan/40 neural-glow-cyan"
                        : "bg-neural-surface-alt border-neural-border hover:border-neural-border-bright"
                    }`}
                  >
                    <TrendingUp className={`w-8 h-8 ${config.gainMode === mode ? "text-neural-accent-cyan" : "text-neural-text-muted"}`} />
                    <span className={`text-lg font-semibold capitalize ${config.gainMode === mode ? "text-neural-accent-cyan" : "text-neural-text-secondary"}`}>
                      {mode}
                    </span>
                    <div className="text-center space-y-0.5">
                      <div className="text-xs text-neural-text-muted">{info.gain} gain</div>
                      <div className="text-[10px] text-neural-text-muted">Noise: {info.noise}</div>
                      <div className="text-[10px] text-neural-text-muted">BW: {info.bw}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Stimulation ── */}
        {activeTab === "stim" && (
          <div>
            <h2 className="text-lg font-semibold text-neural-text-primary mb-1">Stimulation Configuration</h2>
            <p className="text-sm text-neural-text-muted mb-6">
              Configure electrical stimulation parameters.
            </p>

            <div className="flex items-center gap-3 mb-6 p-4 bg-neural-surface-alt rounded-lg border border-neural-border">
              <label className="text-sm text-neural-text-secondary font-medium">Stimulation Enabled</label>
              <button
                onClick={() => dispatch(setStimulationConfig({ enabled: !config.stimulation.enabled }))}
                className={`w-10 h-5 rounded-full relative neural-transition ${
                  config.stimulation.enabled ? "bg-neural-accent-amber" : "bg-neural-border-bright"
                }`}
              >
                <div
                  className="w-4 h-4 rounded-full bg-white absolute top-0.5 neural-transition"
                  style={{ left: config.stimulation.enabled ? "22px" : "2px" }}
                />
              </button>
              {config.stimulation.enabled && (
                <span className="text-xs text-neural-accent-amber ml-2 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Active
                </span>
              )}
            </div>

            <div className="space-y-1 divide-y divide-neural-border/50">
              <ParamSlider label="Amplitude" value={config.stimulation.amplitudeUa} min={1} max={500} step={1} unit="uA" onChange={(v) => dispatch(setStimulationConfig({ amplitudeUa: v }))} />
              <ParamSlider label="Pulse Duration" value={config.stimulation.pulseDurationUs} min={10} max={5000} step={10} unit="us" onChange={(v) => dispatch(setStimulationConfig({ pulseDurationUs: v }))} />
              <ParamSlider label="Frequency" value={config.stimulation.frequencyHz} min={1} max={1000} step={1} unit="Hz" onChange={(v) => dispatch(setStimulationConfig({ frequencyHz: v }))} />
              <ParamSlider label="Train Duration" value={config.stimulation.trainDurationMs} min={10} max={10000} step={10} unit="ms" onChange={(v) => dispatch(setStimulationConfig({ trainDurationMs: v }))} />
              <ParamSlider label="Inter-Phase Delay" value={config.stimulation.interPhaseDelayUs} min={0} max={500} step={5} unit="us" onChange={(v) => dispatch(setStimulationConfig({ interPhaseDelayUs: v }))} />
            </div>

            <div className="mt-6">
              <label className="text-sm text-neural-text-secondary mb-2 block">Waveform</label>
              <div className="flex gap-2">
                {(["biphasic", "monophasic", "sine", "custom"] as const).map((wf) => (
                  <button
                    key={wf}
                    onClick={() => dispatch(setStimulationConfig({ waveform: wf }))}
                    className={`px-4 py-2 rounded-lg text-sm capitalize neural-transition ${
                      config.stimulation.waveform === wf
                        ? "bg-neural-accent-amber/20 text-neural-accent-amber border border-neural-accent-amber/30"
                        : "bg-neural-surface-alt text-neural-text-secondary border border-neural-border hover:border-neural-border-bright"
                    }`}
                  >
                    {wf}
                  </button>
                ))}
              </div>
            </div>

            {/* Stimulation channel selector */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-neural-text-secondary">
                  Stimulation Channels
                  <span className="text-neural-text-muted ml-1">
                    ({config.stimulation.channels.length} / {stimChannelCount} selected)
                  </span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleSelectAllStimChannels}
                    className="px-2 py-0.5 text-[10px] rounded bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary border border-neural-border neural-transition"
                  >
                    All
                  </button>
                  <button
                    onClick={handleClearStimChannels}
                    className="px-2 py-0.5 text-[10px] rounded bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary border border-neural-border neural-transition"
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-16 gap-px bg-neural-surface-alt rounded-lg p-2 border border-neural-border max-h-36 overflow-y-auto"
                   style={{ gridTemplateColumns: "repeat(16, 1fr)" }}
              >
                {Array.from({ length: stimChannelCount }, (_, ch) => {
                  const isSelected = config.stimulation.channels.includes(ch);
                  return (
                    <button
                      key={ch}
                      onClick={() => handleToggleStimChannel(ch)}
                      className={`w-full aspect-square rounded text-[9px] font-mono neural-transition ${
                        isSelected
                          ? "bg-neural-accent-amber/30 text-neural-accent-amber border border-neural-accent-amber/40"
                          : "bg-neural-surface text-neural-text-muted hover:bg-neural-border/50 border border-transparent"
                      }`}
                      title={`CH${ch}`}
                    >
                      {ch}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Pixel/Array Configuration ── */}
        {activeTab === "pixel" && (
          <div>
            <h2 className="text-lg font-semibold text-neural-text-primary mb-1">Pixel / Array Configuration</h2>
            <p className="text-sm text-neural-text-muted mb-4">
              Configure electrode array dimensions and readout settings.
            </p>

            {/* Computed summary */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <InfoChip label="Total Pixels" value={totalPixels.toLocaleString()} />
              <InfoChip label="ROI Pixels" value={roiPixelCount.toLocaleString()} />
              <InfoChip label="ROI Coverage" value={`${((roiPixelCount / totalPixels) * 100).toFixed(1)}%`} />
            </div>

            <div className="space-y-1 divide-y divide-neural-border/50">
              <ParamSlider label="Array Rows" value={config.pixel.arrayRows} min={1} max={128} step={1} unit="" onChange={(v) => dispatch(setPixelConfig({ arrayRows: v }))} />
              <ParamSlider label="Array Cols" value={config.pixel.arrayCols} min={1} max={128} step={1} unit="" onChange={(v) => dispatch(setPixelConfig({ arrayCols: v }))} />
              <ParamSlider label="ROI Start Row" value={config.pixel.roiStartRow} min={0} max={config.pixel.arrayRows - 1} step={1} unit="" onChange={(v) => dispatch(setPixelConfig({ roiStartRow: v }))} />
              <ParamSlider label="ROI Start Col" value={config.pixel.roiStartCol} min={0} max={config.pixel.arrayCols - 1} step={1} unit="" onChange={(v) => dispatch(setPixelConfig({ roiStartCol: v }))} />
              <ParamSlider label="ROI End Row" value={config.pixel.roiEndRow} min={0} max={config.pixel.arrayRows - 1} step={1} unit="" onChange={(v) => dispatch(setPixelConfig({ roiEndRow: v }))} />
              <ParamSlider label="ROI End Col" value={config.pixel.roiEndCol} min={0} max={config.pixel.arrayCols - 1} step={1} unit="" onChange={(v) => dispatch(setPixelConfig({ roiEndCol: v }))} />
            </div>

            <div className="mt-6">
              <label className="text-sm text-neural-text-secondary mb-2 block">Readout Order</label>
              <div className="flex gap-2">
                {(["sequential", "random", "roi"] as const).map((order) => (
                  <button
                    key={order}
                    onClick={() => dispatch(setPixelConfig({ readoutOrder: order }))}
                    className={`px-4 py-2 rounded-lg text-sm capitalize neural-transition ${
                      config.pixel.readoutOrder === order
                        ? "bg-neural-accent-blue/20 text-neural-accent-blue border border-neural-accent-blue/30"
                        : "bg-neural-surface-alt text-neural-text-secondary border border-neural-border hover:border-neural-border-bright"
                    }`}
                  >
                    {order}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
