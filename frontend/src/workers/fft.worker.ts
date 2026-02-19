/**
 * Web Worker for offloading FFT computation from the main thread.
 * Receives sample data, computes FFT magnitude (dB), and returns results.
 */

interface FFTRequest {
  id: number;
  samples: Float32Array;
  windowSize: number;
}

interface FFTResponse {
  id: number;
  magnitudes: Float32Array;
}

/**
 * Cooley-Tukey radix-2 DIT FFT with Hanning window.
 * Returns magnitude spectrum in dB.
 */
function computeFFT(samples: Float32Array, windowSize: number): Float32Array {
  const N = windowSize;
  const padded = new Float32Array(N);
  padded.set(samples.subarray(0, Math.min(samples.length, N)));

  // Hanning window
  for (let i = 0; i < N; i++) {
    padded[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  }

  // Bit-reversal permutation
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  const bits = Math.log2(N);
  for (let i = 0; i < N; i++) {
    let rev = 0;
    for (let b = 0; b < bits; b++) {
      rev = (rev << 1) | ((i >> b) & 1);
    }
    real[rev] = padded[i];
  }

  // Butterfly
  for (let size = 2; size <= N; size *= 2) {
    const half = size / 2;
    const step = (-2 * Math.PI) / size;
    for (let i = 0; i < N; i += size) {
      for (let j = 0; j < half; j++) {
        const angle = step * j;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const tR = real[i + j + half] * cos - imag[i + j + half] * sin;
        const tI = real[i + j + half] * sin + imag[i + j + half] * cos;
        real[i + j + half] = real[i + j] - tR;
        imag[i + j + half] = imag[i + j] - tI;
        real[i + j] += tR;
        imag[i + j] += tI;
      }
    }
  }

  // Magnitude in dB
  const freqBins = N / 2;
  const magnitudes = new Float32Array(freqBins);
  for (let i = 0; i < freqBins; i++) {
    const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / freqBins;
    magnitudes[i] = 20 * Math.log10(Math.max(mag, 1e-10));
  }

  return magnitudes;
}

// Worker message handler
self.onmessage = (e: MessageEvent<FFTRequest>) => {
  const { id, samples, windowSize } = e.data;
  const magnitudes = computeFFT(samples, windowSize);

  const response: FFTResponse = { id, magnitudes };
  (self as unknown as Worker).postMessage(response, [magnitudes.buffer]);
};
