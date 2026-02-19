/**
 * Core WebGL 2.0 waveform renderer for high-performance multi-channel
 * neural signal visualization. Supports up to 64 simultaneous channels
 * with LOD decimation built in.
 */

import { decimateMinMax, bufferPool } from "./LODEngine";

/* ─── Shader Sources ─── */

const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

// Per-vertex attributes
in float a_sampleIndex;
in float a_sampleValue;

// Uniforms
uniform float u_startSample;
uniform float u_endSample;
uniform float u_yMin;
uniform float u_yMax;
uniform float u_channelOffset;  // vertical offset for stacked mode
uniform float u_channelHeight;  // height fraction per channel
uniform vec3 u_color;

out vec3 v_color;

void main() {
  // Map sample index to x: [startSample..endSample] -> [-1..1]
  float x = 2.0 * (a_sampleIndex - u_startSample) / (u_endSample - u_startSample) - 1.0;

  // Map sample value to y within the channel strip
  float normalizedY = (a_sampleValue - u_yMin) / (u_yMax - u_yMin); // 0..1
  float y = u_channelOffset + normalizedY * u_channelHeight;

  // Map to clip space: y was in [0..1], convert to [-1..1]
  y = 2.0 * y - 1.0;

  gl_Position = vec4(x, y, 0.0, 1.0);
  v_color = u_color;
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec3 v_color;
out vec4 fragColor;

void main() {
  fragColor = vec4(v_color, 1.0);
}
`;

/* ─── Grid Shader Sources ─── */

const GRID_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
uniform vec4 u_lineColor;
out vec4 v_lineColor;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_lineColor = u_lineColor;
}
`;

const GRID_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_lineColor;
out vec4 fragColor;

void main() {
  fragColor = v_lineColor;
}
`;

/* ─── Types ─── */

interface ChannelState {
  data: Float32Array;
  color: [number, number, number];
  vboIndex: WebGLBuffer | null;
  vboValue: WebGLBuffer | null;
  vao: WebGLVertexArrayObject | null;
  sampleCount: number;
  active: boolean;
  /** Pooled buffer for decimated output — returned to pool on next upload. */
  decimatedBuf: Float32Array | null;
}

/* ─── Renderer Class ─── */

export class WaveformWebGLRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement;
  private maxChannels: number;

  // Waveform program
  private waveformProgram: WebGLProgram | null = null;
  private uStartSample: WebGLUniformLocation | null = null;
  private uEndSample: WebGLUniformLocation | null = null;
  private uYMin: WebGLUniformLocation | null = null;
  private uYMax: WebGLUniformLocation | null = null;
  private uChannelOffset: WebGLUniformLocation | null = null;
  private uChannelHeight: WebGLUniformLocation | null = null;
  private uColor: WebGLUniformLocation | null = null;

  // Grid program
  private gridProgram: WebGLProgram | null = null;
  private gridVao: WebGLVertexArrayObject | null = null;
  private gridVbo: WebGLBuffer | null = null;
  private uGridLineColor: WebGLUniformLocation | null = null;

  // Channel state
  private channels: ChannelState[] = [];

  // Viewport settings
  private viewStartSample: number = 0;
  private viewEndSample: number = 1000;
  private viewYMin: number = -1;
  private viewYMax: number = 1;

  // Display options
  private showGrid: boolean = true;
  private stackedMode: boolean = true;

  constructor(canvas: HTMLCanvasElement, maxChannels: number = 64) {
    this.canvas = canvas;
    this.maxChannels = Math.min(maxChannels, 64);

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      console.error("WebGL 2.0 not available");
      return;
    }

    this.gl = gl;
    this.initShaders();
    this.initChannels();
    this.initGrid();

    // Set dark background
    gl.clearColor(0.06, 0.07, 0.09, 1.0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private compileShader(source: string, type: number): WebGLShader | null {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  private createProgram(vsSrc: string, fsSrc: string): WebGLProgram | null {
    const gl = this.gl!;
    const vs = this.compileShader(vsSrc, gl.VERTEX_SHADER);
    const fs = this.compileShader(fsSrc, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    // Clean up shaders after linking
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return program;
  }

  private initShaders(): void {
    const gl = this.gl!;

    // Waveform program
    this.waveformProgram = this.createProgram(VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
    if (this.waveformProgram) {
      this.uStartSample = gl.getUniformLocation(this.waveformProgram, "u_startSample");
      this.uEndSample = gl.getUniformLocation(this.waveformProgram, "u_endSample");
      this.uYMin = gl.getUniformLocation(this.waveformProgram, "u_yMin");
      this.uYMax = gl.getUniformLocation(this.waveformProgram, "u_yMax");
      this.uChannelOffset = gl.getUniformLocation(this.waveformProgram, "u_channelOffset");
      this.uChannelHeight = gl.getUniformLocation(this.waveformProgram, "u_channelHeight");
      this.uColor = gl.getUniformLocation(this.waveformProgram, "u_color");
    }

    // Grid program
    this.gridProgram = this.createProgram(GRID_VERTEX_SHADER, GRID_FRAGMENT_SHADER);
    if (this.gridProgram) {
      this.uGridLineColor = gl.getUniformLocation(this.gridProgram, "u_lineColor");
    }
  }

  private initChannels(): void {
    const gl = this.gl!;

    // Default channel colors: cycle through a set of bright colors
    const defaultColors: [number, number, number][] = [
      [0.0, 0.85, 0.85],  // cyan
      [0.0, 0.75, 1.0],   // blue
      [0.4, 0.85, 0.3],   // green
      [1.0, 0.75, 0.0],   // amber
      [1.0, 0.35, 0.35],  // red
      [0.7, 0.5, 1.0],    // purple
      [1.0, 0.55, 0.7],   // pink
      [0.5, 1.0, 0.65],   // mint
    ];

    for (let i = 0; i < this.maxChannels; i++) {
      const vao = gl.createVertexArray();
      const vboIndex = gl.createBuffer();
      const vboValue = gl.createBuffer();
      const color = defaultColors[i % defaultColors.length];

      this.channels.push({
        data: new Float32Array(0),
        color,
        vboIndex,
        vboValue,
        vao,
        sampleCount: 0,
        active: false,
        decimatedBuf: null,
      });
    }
  }

  private initGrid(): void {
    const gl = this.gl!;
    this.gridVao = gl.createVertexArray();
    this.gridVbo = gl.createBuffer();
  }

  /**
   * Upload new sample data for a specific channel.
   * The renderer will apply LOD decimation automatically based on viewport width.
   */
  setData(channelIndex: number, samples: Float32Array): void {
    if (channelIndex < 0 || channelIndex >= this.maxChannels || !this.gl) return;

    const ch = this.channels[channelIndex];
    ch.data = samples;
    ch.active = samples.length > 0;
    this.uploadChannelData(channelIndex);
  }

  private uploadChannelData(channelIndex: number): void {
    const gl = this.gl!;
    const ch = this.channels[channelIndex];
    if (!ch.active || !ch.vao || !ch.vboIndex || !ch.vboValue || !this.waveformProgram) return;

    // Return previous pooled buffer before acquiring a new one
    if (ch.decimatedBuf) {
      bufferPool.release(ch.decimatedBuf);
      ch.decimatedBuf = null;
    }

    // Apply LOD decimation: compute min/max per pixel column
    const viewSamples = this.viewEndSample - this.viewStartSample;
    const canvasWidth = this.canvas.width;
    let displayData: Float32Array;
    let sampleCount: number;

    if (ch.data.length > canvasWidth * 2 && viewSamples > canvasWidth * 2) {
      // Need decimation: acquire a pooled buffer and reuse it
      const needed = canvasWidth * 2;
      const reuse = bufferPool.acquire(needed);
      const decimated = decimateMinMax(ch.data, canvasWidth, reuse);
      ch.decimatedBuf = reuse; // track for release on next upload
      sampleCount = needed;
      displayData = decimated;
    } else {
      displayData = ch.data;
      sampleCount = ch.data.length;
    }

    ch.sampleCount = sampleCount;

    // Build index array
    const indices = new Float32Array(sampleCount);
    if (displayData === ch.data) {
      // Raw data: indices are 0, 1, 2, ...
      for (let i = 0; i < sampleCount; i++) {
        indices[i] = i;
      }
    } else {
      // Decimated min/max: spread indices across viewport
      for (let i = 0; i < sampleCount; i++) {
        const pixelCol = Math.floor(i / 2);
        const fraction = pixelCol / canvasWidth;
        indices[i] = this.viewStartSample + fraction * viewSamples;
      }
    }

    gl.bindVertexArray(ch.vao);

    // Upload index data
    const aIndexLoc = gl.getAttribLocation(this.waveformProgram, "a_sampleIndex");
    gl.bindBuffer(gl.ARRAY_BUFFER, ch.vboIndex);
    gl.bufferData(gl.ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aIndexLoc);
    gl.vertexAttribPointer(aIndexLoc, 1, gl.FLOAT, false, 0, 0);

    // Upload value data
    const aValueLoc = gl.getAttribLocation(this.waveformProgram, "a_sampleValue");
    gl.bindBuffer(gl.ARRAY_BUFFER, ch.vboValue);
    gl.bufferData(gl.ARRAY_BUFFER, displayData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aValueLoc);
    gl.vertexAttribPointer(aValueLoc, 1, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  /**
   * Set the display color for a channel.
   */
  setChannelColor(channelIndex: number, r: number, g: number, b: number): void {
    if (channelIndex < 0 || channelIndex >= this.maxChannels) return;
    this.channels[channelIndex].color = [r, g, b];
  }

  /**
   * Set the viewport range (which samples and amplitude range to display).
   */
  setViewport(startSample: number, endSample: number, yMin: number, yMax: number): void {
    this.viewStartSample = startSample;
    this.viewEndSample = endSample;
    this.viewYMin = yMin;
    this.viewYMax = yMax;
  }

  /**
   * Set whether channels are stacked vertically or overlaid.
   */
  setStackedMode(stacked: boolean): void {
    this.stackedMode = stacked;
  }

  /**
   * Toggle grid line rendering.
   */
  setShowGrid(show: boolean): void {
    this.showGrid = show;
  }

  /**
   * Render all active channels.
   */
  render(): void {
    const gl = this.gl;
    if (!gl || !this.waveformProgram) return;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Count active channels
    const activeChannels = this.channels.filter((ch) => ch.active);
    const activeCount = activeChannels.length;
    if (activeCount === 0) return;

    // Draw grid first (behind waveforms)
    if (this.showGrid) {
      this.renderGrid(activeCount);
    }

    // Draw each active channel
    gl.useProgram(this.waveformProgram);
    gl.uniform1f(this.uStartSample!, this.viewStartSample);
    gl.uniform1f(this.uEndSample!, this.viewEndSample);
    gl.uniform1f(this.uYMin!, this.viewYMin);
    gl.uniform1f(this.uYMax!, this.viewYMax);

    let activeIdx = 0;
    for (let i = 0; i < this.maxChannels; i++) {
      const ch = this.channels[i];
      if (!ch.active || !ch.vao || ch.sampleCount === 0) continue;

      if (this.stackedMode) {
        // Stacked: each channel gets its own vertical strip
        const channelHeight = 1.0 / activeCount;
        const channelOffset = 1.0 - (activeIdx + 1) * channelHeight;
        gl.uniform1f(this.uChannelOffset!, channelOffset);
        gl.uniform1f(this.uChannelHeight!, channelHeight);
      } else {
        // Overlaid: all channels share the full height
        gl.uniform1f(this.uChannelOffset!, 0.0);
        gl.uniform1f(this.uChannelHeight!, 1.0);
      }

      gl.uniform3f(this.uColor!, ch.color[0], ch.color[1], ch.color[2]);

      gl.bindVertexArray(ch.vao);
      gl.drawArrays(gl.LINE_STRIP, 0, ch.sampleCount);

      activeIdx++;
    }

    gl.bindVertexArray(null);
  }

  private renderGrid(activeChannelCount: number): void {
    const gl = this.gl!;
    if (!this.gridProgram || !this.gridVao || !this.gridVbo) return;

    const lines: number[] = [];

    if (this.stackedMode) {
      // Horizontal separator lines between channels
      for (let i = 1; i < activeChannelCount; i++) {
        const y = 2.0 * (i / activeChannelCount) - 1.0;
        lines.push(-1, y, 1, y);
      }

      // Zero lines within each channel strip
      for (let i = 0; i < activeChannelCount; i++) {
        const channelHeight = 1.0 / activeChannelCount;
        const centerY = 1.0 - (i + 0.5) * channelHeight;
        const clipY = 2.0 * centerY - 1.0;
        lines.push(-1, clipY, 1, clipY);
      }
    } else {
      // Single zero line
      lines.push(-1, 0, 1, 0);
    }

    // Vertical time grid lines (10 divisions)
    const divisions = 10;
    for (let i = 1; i < divisions; i++) {
      const x = 2.0 * (i / divisions) - 1.0;
      lines.push(x, -1, x, 1);
    }

    const lineData = new Float32Array(lines);

    gl.useProgram(this.gridProgram);
    gl.bindVertexArray(this.gridVao);

    const aPosLoc = gl.getAttribLocation(this.gridProgram, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVbo);
    gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

    gl.uniform4f(this.uGridLineColor!, 0.25, 0.27, 0.3, 0.5);
    gl.drawArrays(gl.LINES, 0, lineData.length / 2);

    gl.bindVertexArray(null);
  }

  /**
   * Resize the canvas and update the GL viewport.
   * Automatically accounts for devicePixelRatio for HiDPI displays.
   */
  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    const scaledW = Math.round(width * dpr);
    const scaledH = Math.round(height * dpr);
    this.canvas.width = scaledW;
    this.canvas.height = scaledH;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    if (this.gl) {
      this.gl.viewport(0, 0, scaledW, scaledH);
    }
  }

  /**
   * Clean up all WebGL resources.
   */
  dispose(): void {
    const gl = this.gl;
    if (!gl) return;

    for (const ch of this.channels) {
      if (ch.vboIndex) gl.deleteBuffer(ch.vboIndex);
      if (ch.vboValue) gl.deleteBuffer(ch.vboValue);
      if (ch.vao) gl.deleteVertexArray(ch.vao);
      if (ch.decimatedBuf) bufferPool.release(ch.decimatedBuf);
    }
    this.channels = [];

    if (this.gridVbo) gl.deleteBuffer(this.gridVbo);
    if (this.gridVao) gl.deleteVertexArray(this.gridVao);
    if (this.waveformProgram) gl.deleteProgram(this.waveformProgram);
    if (this.gridProgram) gl.deleteProgram(this.gridProgram);

    this.gl = null;
  }

  /**
   * Check if the renderer is operational.
   */
  get isReady(): boolean {
    return this.gl !== null && this.waveformProgram !== null;
  }

  /**
   * Get the number of currently active channels.
   */
  get activeChannelCount(): number {
    return this.channels.filter((ch) => ch.active).length;
  }
}
