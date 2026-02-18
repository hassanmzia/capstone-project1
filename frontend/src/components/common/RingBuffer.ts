/**
 * Client-side ring buffer for storing streaming neural data per channel.
 * Uses SharedArrayBuffer if available, falling back to standard ArrayBuffer.
 */

export class ClientRingBuffer {
  private readonly channelCount: number;
  private readonly samplesPerChannel: number;
  private readonly buffers: Float32Array[];
  private readonly writeOffsets: Uint32Array;
  private readonly totalWritten: Float64Array;

  constructor(channelCount: number, samplesPerChannel: number) {
    this.channelCount = channelCount;
    this.samplesPerChannel = samplesPerChannel;
    this.buffers = [];
    
    // Try SharedArrayBuffer first for potential Web Worker sharing
    const BufferCtor = typeof SharedArrayBuffer !== "undefined" ? SharedArrayBuffer : ArrayBuffer;

    for (let i = 0; i < channelCount; i++) {
      const ab = new BufferCtor(samplesPerChannel * Float32Array.BYTES_PER_ELEMENT);
      this.buffers.push(new Float32Array(ab));
    }

    // Write position tracker per channel
    const offsetBuf = new BufferCtor(channelCount * Uint32Array.BYTES_PER_ELEMENT);
    this.writeOffsets = new Uint32Array(offsetBuf);

    // Total samples written per channel (for calculating actual position)
    const totalBuf = new BufferCtor(channelCount * Float64Array.BYTES_PER_ELEMENT);
    this.totalWritten = new Float64Array(totalBuf);
  }

  /**
   * Push new sample data for all channels. Each element in channelData
   * corresponds to a channel and contains the new samples to append.
   */
  push(channelData: Float32Array[]): void {
    const count = Math.min(channelData.length, this.channelCount);
    for (let ch = 0; ch < count; ch++) {
      const samples = channelData[ch];
      if (!samples || samples.length === 0) continue;

      const buf = this.buffers[ch];
      let writePos = this.writeOffsets[ch];

      if (samples.length >= this.samplesPerChannel) {
        // Data larger than buffer: just copy the tail
        const offset = samples.length - this.samplesPerChannel;
        buf.set(samples.subarray(offset));
        writePos = 0;
      } else {
        const spaceToEnd = this.samplesPerChannel - writePos;
        if (samples.length <= spaceToEnd) {
          // Fits without wrapping
          buf.set(samples, writePos);
          writePos = (writePos + samples.length) % this.samplesPerChannel;
        } else {
          // Wraps around
          buf.set(samples.subarray(0, spaceToEnd), writePos);
          const remaining = samples.length - spaceToEnd;
          buf.set(samples.subarray(spaceToEnd, spaceToEnd + remaining), 0);
          writePos = remaining;
        }
      }

      this.writeOffsets[ch] = writePos;
      this.totalWritten[ch] += samples.length;
    }
  }

  /**
   * Get a window of data from a channel starting at an offset from the
   * current write position (negative = backwards in time).
   */
  getWindow(channelIndex: number, startOffset: number, length: number): Float32Array {
    if (channelIndex < 0 || channelIndex >= this.channelCount) {
      return new Float32Array(length);
    }

    const buf = this.buffers[channelIndex];
    const writePos = this.writeOffsets[channelIndex];
    const result = new Float32Array(length);

    // startOffset is relative to writePos
    let readPos = ((writePos + startOffset) % this.samplesPerChannel + this.samplesPerChannel) % this.samplesPerChannel;

    for (let i = 0; i < length; i++) {
      result[i] = buf[readPos];
      readPos = (readPos + 1) % this.samplesPerChannel;
    }

    return result;
  }

  /**
   * Get the most recent `length` samples for a given channel.
   */
  getLatest(channelIndex: number, length: number): Float32Array {
    const actualLen = Math.min(length, this.samplesPerChannel);
    return this.getWindow(channelIndex, -actualLen, actualLen);
  }

  /**
   * Get total number of samples that have been written to a channel.
   */
  getTotalWritten(channelIndex: number): number {
    return this.totalWritten[channelIndex];
  }

  /**
   * Get the current fill level (0-1) for a channel.
   */
  getFillLevel(channelIndex: number): number {
    const total = this.totalWritten[channelIndex];
    return Math.min(1, total / this.samplesPerChannel);
  }

  /**
   * Reset all buffers to zero.
   */
  clear(): void {
    for (let ch = 0; ch < this.channelCount; ch++) {
      this.buffers[ch].fill(0);
      this.writeOffsets[ch] = 0;
      this.totalWritten[ch] = 0;
    }
  }

  /**
   * Get the underlying buffer for a channel (for direct WebGL upload).
   */
  getRawBuffer(channelIndex: number): Float32Array {
    return this.buffers[channelIndex];
  }

  /**
   * Get the current write offset for a channel.
   */
  getWriteOffset(channelIndex: number): number {
    return this.writeOffsets[channelIndex];
  }

  get channels(): number {
    return this.channelCount;
  }

  get capacity(): number {
    return this.samplesPerChannel;
  }
}
