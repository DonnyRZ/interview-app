class OrvikoPcm16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 24000;
    this.sourcePosition = 0;
    this.chunk = new Int16Array(2400);
    this.chunkOffset = 0;
    this.active = false;
    this.port.onmessage = (event) => {
      this.active = event.data?.type === "active" && event.data.value === true;
      if (!this.active) {
        this.sourcePosition = 0;
        this.chunk = new Int16Array(2400);
        this.chunkOffset = 0;
      }
    };
  }

  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!this.active || !samples?.length) return true;

    const sourceStep = sampleRate / this.targetRate;
    while (this.sourcePosition < samples.length) {
      const sample = samples[Math.min(samples.length - 1, Math.floor(this.sourcePosition))] || 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      this.chunk[this.chunkOffset] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      this.chunkOffset += 1;
      this.sourcePosition += sourceStep;

      if (this.chunkOffset === this.chunk.length) {
        this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
        this.chunk = new Int16Array(2400);
        this.chunkOffset = 0;
      }
    }
    this.sourcePosition -= samples.length;
    return true;
  }
}

registerProcessor("orviko-pcm16-processor", OrvikoPcm16Processor);
