import { useEffect, useState } from 'react';

let ctx = null;
export function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Per-tab/device sound switch: in one room only one device needs to play the show,
// otherwise every phone plays it a few ms apart and it sounds like an echo.
let soundOn = sessionStorage.getItem('vb-sound') !== 'off';
const soundListeners = new Set();

export function setSoundOn(on) {
  soundOn = on;
  sessionStorage.setItem('vb-sound', on ? 'on' : 'off');
  if (current) current.muted = !on;
  soundListeners.forEach(fn => fn(on));
}

export function useSoundOn() {
  const [value, setValue] = useState(soundOn);
  useEffect(() => {
    soundListeners.add(setValue);
    return () => soundListeners.delete(setValue);
  }, []);
  return value;
}

let current = null;
// Personal previews (your clip, your takes) pass ignoreMute: the switch only mutes the shared show.
export function playUrl(url, { ignoreMute = false } = {}) {
  stopPlayback();
  current = new Audio(url);
  current.muted = !soundOn && !ignoreMute;
  current.play().catch(() => {});
  return current;
}
export function stopPlayback() {
  if (current) current.pause();
  current = null;
}

function noise(c, seconds) {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  return src;
}

function envelope(c, peak, at, attack, release) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
  g.connect(c.destination);
  return g;
}

function burst(c, at, { freq, q = 1, type = 'bandpass', peak = 0.4, attack = 0.003, release = 0.08 }) {
  const src = noise(c, attack + release + 0.05);
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, at);
  filter.Q.value = q;
  src.connect(filter).connect(envelope(c, peak, at, attack, release));
  src.start(at);
  src.stop(at + attack + release + 0.05);
  return filter;
}

function tone(c, at, { type = 'sine', from, to = from, dur, peak = 0.25 }) {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  osc.connect(envelope(c, peak, at, 0.01, dur));
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

const withCtx = fn => () => {
  if (!soundOn) return;
  const c = audioCtx();
  fn(c, c.currentTime);
};

export const sfx = {
  '👏': withCtx((c, t) => {
    for (let i = 0; i < 3; i++) burst(c, t + i * 0.09, { freq: 1400 + Math.random() * 400, q: 1.2 });
  }),
  '😂': withCtx((c, t) => {
    [520, 470, 430, 400].forEach((f, i) => tone(c, t + i * 0.11, { type: 'triangle', from: f, to: f * 0.85, dur: 0.08 }));
  }),
  '🔥': withCtx((c, t) => {
    const f = burst(c, t, { freq: 400, q: 2, peak: 0.35, attack: 0.05, release: 0.45 });
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.45);
  }),
  '🍅': withCtx((c, t) => {
    burst(c, t, { freq: 600, type: 'lowpass', peak: 0.6, release: 0.22 });
    tone(c, t, { from: 160, to: 60, dur: 0.18, peak: 0.5 });
  }),
  cheer: withCtx((c, t) => {
    for (let i = 0; i < 40; i++) burst(c, t + Math.random() * 2, { freq: 1000 + Math.random() * 1500, peak: 0.15 + Math.random() * 0.15 });
    burst(c, t, { freq: 900, q: 0.7, peak: 0.12, attack: 0.4, release: 1.8 });
    [523, 659, 784].forEach((f, i) => tone(c, t + i * 0.12, { type: 'square', from: f, dur: 0.25, peak: 0.06 }));
  }),
  groan: withCtx((c, t) => {
    tone(c, t, { type: 'sawtooth', from: 220, to: 110, dur: 1.1, peak: 0.12 });
    tone(c, t + 0.05, { type: 'sawtooth', from: 165, to: 82, dur: 1.1, peak: 0.1 });
  }),
  pop: withCtx((c, t) => {
    tone(c, t, { from: 300, to: 900, dur: 0.15, peak: 0.3 });
  }),
};

let unlocked = false;
const listeners = new Set();

export function unlockAudio() {
  audioCtx();
  unlocked = true;
  listeners.forEach(fn => fn(true));
}

export function useAudioUnlocked() {
  const [value, setValue] = useState(unlocked);
  useEffect(() => {
    listeners.add(setValue);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}

export function useAudioUnlock() {
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, []);
}
