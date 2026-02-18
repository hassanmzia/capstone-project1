import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "@/store";
import {
  setBiasParams,
  setClockConfig,
  setTiaConfig,
  setGainMode,
  setStimulationConfig,
  setPixelConfig,
} from "@/store/slices/configSlice";
import type { GainMode } from "@/types/neural";
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
} from "lucide-react";

const tabs = [
  { id: "bias", label: "Bias Config", icon: SlidersHorizontal },
  { id: "clock", label: "Clock", icon: Clock },
  { id: "tia", label: "TIA", icon: Radio },
  { id: "gain", label: "Gain Mode", icon: TrendingUp },
  { id: "stim", label: "Stimulation", icon: Zap },
  { id: "pixel", label: "Pixel/Array", icon: Grid3X3 },
] as const;

type TabId = (typeof tabs)[number]["id"];

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

export default function ControlsPage() {
  const dispatch = useDispatch();
  const config = useSelector((state: RootState) => state.config);
  const [activeTab, setActiveTab] = useState<TabId>("bias");

  const biasEntries: [string, string, number, number, number, string][] = [
    ["vRefP", "V Ref Positive", 0, 3.3, 0.01, "V"],
    ["vRefN", "V Ref Negative", 0, 3.3, 0.01, "V"],
    ["biasCasc", "Bias Cascode", 0, 3.3, 0.01, "V"],
    ["biasInp", "Bias Input", 0, 3.3, 0.01, "V"],
    ["biasOta", "Bias OTA", 0, 3.3, 0.01, "V"],
    ["biasDiffamp", "Bias Diff Amp", 0, 3.3, 0.01, "V"],
    ["biasBuf", "Bias Buffer", 0, 3.3, 0.01, "V"],
    ["biasComp", "Bias Comparator", 0, 3.3, 0.01, "V"],
    ["biasThreshold", "Bias Threshold", 0, 3.3, 0.01, "V"],
    ["biasRef", "Bias Reference", 0, 3.3, 0.01, "V"],
    ["biasSf", "Bias Source Follower", 0, 3.3, 0.01, "V"],
    ["biasCalp", "Bias Cal Positive", 0, 3.3, 0.01, "V"],
    ["biasCaln", "Bias Cal Negative", 0, 3.3, 0.01, "V"],
    ["biasStim", "Bias Stimulation", 0, 3.3, 0.01, "V"],
    ["biasReset", "Bias Reset", 0, 3.3, 0.01, "V"],
    ["biasPga", "Bias PGA", 0, 3.3, 0.01, "V"],
    ["biasAdc", "Bias ADC", 0, 3.3, 0.01, "V"],
    ["biasDac", "Bias DAC", 0, 3.3, 0.01, "V"],
    ["biasLvds", "Bias LVDS", 0, 3.3, 0.01, "V"],
    ["biasPad", "Bias Pad", 0, 3.3, 0.01, "V"],
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Tabs */}
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

        {config.isDirty && (
          <div className="flex items-center gap-1.5 text-xs text-neural-accent-amber mr-2">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Unsaved changes</span>
          </div>
        )}

        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border border-neural-border neural-transition">
          <Upload className="w-4 h-4" />
          Load Preset
        </button>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border border-neural-border neural-transition">
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border border-neural-accent-cyan/30 neural-transition">
          <Save className="w-4 h-4" />
          Apply
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 bg-neural-surface rounded-xl border border-neural-border p-6 overflow-y-auto">
        {/* Bias Configuration */}
        {activeTab === "bias" && (
          <div>
            <h2 className="text-lg font-semibold text-neural-text-primary mb-1">Bias Configuration</h2>
            <p className="text-sm text-neural-text-muted mb-6">
              Configure the 20 bias parameters for the neural amplifier array.
            </p>
            <div className="space-y-1 divide-y divide-neural-border/50">
              {biasEntries.map(([key, label, min, max, step, unit]) => (
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
        )}

        {/* Clock Configuration */}
        {activeTab === "clock" && (
          <div>
            <h2 className="text-lg font-semibold text-neural-text-primary mb-1">Clock Configuration</h2>
            <p className="text-sm text-neural-text-muted mb-6">
              Configure master clock, dividers, and PLL settings.
            </p>
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
                  className={`w-4 h-4 rounded-full bg-white absolute top-0.5 neural-transition ${
                    config.clock.pllEnabled ? "left-5.5" : "left-0.5"
                  }`}
                  style={{ left: config.clock.pllEnabled ? "22px" : "2px" }}
                />
              </button>
            </div>
          </div>
        )}

        {/* TIA Configuration */}
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

        {/* Gain Mode */}
        {activeTab === "gain" && (
          <div>
            <h2 className="text-lg font-semibold text-neural-text-primary mb-1">Gain Mode</h2>
            <p className="text-sm text-neural-text-muted mb-6">
              Select the amplifier gain mode for the electrode array.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(["low", "medium", "high", "ultra"] as GainMode[]).map((mode) => (
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
                  <span className="text-xs text-neural-text-muted">
                    {mode === "low" ? "100x" : mode === "medium" ? "500x" : mode === "high" ? "1000x" : "5000x"} gain
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stimulation */}
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
          </div>
        )}

        {/* Pixel/Array Configuration */}
        {activeTab === "pixel" && (
          <div>
            <h2 className="text-lg font-semibold text-neural-text-primary mb-1">Pixel / Array Configuration</h2>
            <p className="text-sm text-neural-text-muted mb-6">
              Configure electrode array dimensions and readout settings.
            </p>
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
