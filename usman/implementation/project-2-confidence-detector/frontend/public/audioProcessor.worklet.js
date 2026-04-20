/**
 * AudioWorklet processor — captures 20ms audio frames at 16kHz.
 * Never blocks the main thread.
 *
 * USAGE: This is an upgrade path for useAudioCapture.js which currently uses
 * the deprecated ScriptProcessorNode. To switch to AudioWorklet:
 *   const ctx = new AudioContext({ sampleRate: 16000 });
 *   await ctx.audioWorklet.addModule('/audioProcessor.worklet.js');
 *   const workletNode = new AudioWorkletNode(ctx, 'audio-processor');
 *   workletNode.port.onmessage = (e) => sendAudio(e.data.data.buffer);
 *   source.connect(workletNode);
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.FRAME_SIZE = 320; // 20ms at 16kHz
  }

  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;

    this.buffer.push(...input);

    while (this.buffer.length >= this.FRAME_SIZE) {
      const frame = new Float32Array(this.buffer.splice(0, this.FRAME_SIZE));
      this.port.postMessage({ type: 'frame', data: frame }, [frame.buffer]);
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
