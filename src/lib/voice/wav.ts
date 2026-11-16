/**
 * Packs microphone samples into a small 16 kHz mono WAV file for speech-to-text.
 * Raw samples (rather than MediaRecorder) let us keep the half-second before the fan started talking,
 * so the first word is never clipped, and they work the same in every browser.
 */
export function encodeWav(chunks: Float32Array[], inRate: number, outRate = 16_000): ArrayBuffer {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    input.set(c, o);
    o += c.length;
  }

  // Downsample by averaging each output sample's window (a simple low-pass, good enough for speech).
  const ratio = inRate / outRate;
  const outLen = Math.floor(total / ratio);
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(total, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const s = Math.max(-1, Math.min(1, sum / (end - start)));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const buf = new ArrayBuffer(44 + pcm.byteLength);
  const v = new DataView(buf);
  const str = (at: number, s: string) => [...s].forEach((ch, k) => v.setUint8(at + k, ch.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.byteLength, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, outRate, true);
  v.setUint32(28, outRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  str(36, "data");
  v.setUint32(40, pcm.byteLength, true);
  new Int16Array(buf, 44).set(pcm);
  return buf;
}
