/**
 * MusicPlayer — lightweight ambient generator for footer controls.
 * Uses Web Audio API so no external audio files are required.
 */
const MusicPlayer = {
  TRACKS: [
    { name: 'Ambient Track 01', duration: 312, freqs: [82.4, 123.5, 164.8] },
    { name: 'Ambient Track 02', duration: 289, freqs: [73.4, 110.0, 146.8] },
    { name: 'Ambient Track 03', duration: 334, freqs: [65.4, 98.0, 130.8] },
  ],

  index: 0,
  playing: false,
  volume: 0.45,
  elapsed: 0,
  _timer: null,
  _ctx: null,
  _master: null,
  _nodes: [],

  init() {
    this.playBtn = document.getElementById('music-play');
    this.nextBtn = document.getElementById('music-next');
    this.trackEl = document.getElementById('music-track');
    this.timeEl = document.getElementById('music-time');
    this.progressEl = document.getElementById('music-progress');
    this.volumeEl = document.getElementById('music-volume');

    if (!this.playBtn || !this.nextBtn || !this.trackEl || !this.timeEl || !this.progressEl || !this.volumeEl) {
      return;
    }

    const savedVol = Number(localStorage.getItem('cyberspace-music-volume'));
    if (!Number.isNaN(savedVol) && savedVol >= 0 && savedVol <= 1) {
      this.volume = savedVol;
    }
    this.volumeEl.value = String(Math.round(this.volume * 100));

    this.playBtn.addEventListener('click', () => this.toggle());
    this.nextBtn.addEventListener('click', () => this.next());

    this.volumeEl.addEventListener('input', () => {
      this.volume = Number(this.volumeEl.value) / 100;
      localStorage.setItem('cyberspace-music-volume', String(this.volume));
      if (this._master) this._master.gain.value = this.volume;
    });

    this.progressEl.addEventListener('input', () => {
      const track = this.TRACKS[this.index];
      this.elapsed = Math.round((Number(this.progressEl.value) / 100) * track.duration);
      this._renderTime();
    });

    this._renderTrack();
    this._renderTime();
  },

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  },

  play() {
    this._ensureAudio();
    this._startTone();
    this.playing = true;
    this.playBtn.textContent = '⏸';
    this._startClock();
  },

  pause() {
    this.playing = false;
    this.playBtn.textContent = '▶';
    this._stopClock();
    this._stopTone();
  },

  next() {
    this.index = (this.index + 1) % this.TRACKS.length;
    this.elapsed = 0;
    this._renderTrack();
    this._renderTime();
    if (this.playing) {
      this._stopTone();
      this._startTone();
    }
  },

  _ensureAudio() {
    if (this._ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this._ctx = new AudioCtx();
    this._master = this._ctx.createGain();
    this._master.gain.value = this.volume;
    this._master.connect(this._ctx.destination);
  },

  _startTone() {
    if (!this._ctx || !this._master) return;

    const track = this.TRACKS[this.index];
    this._nodes = track.freqs.map((freq, i) => {
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      gain.gain.value = 0.018 - (i * 0.004);

      const lfo = this._ctx.createOscillator();
      const lfoGain = this._ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.06 + i * 0.02;
      lfoGain.gain.value = 0.01 + i * 0.005;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      osc.connect(gain);
      gain.connect(this._master);

      osc.start();
      lfo.start();
      return { osc, gain, lfo, lfoGain };
    });
  },

  _stopTone() {
    for (const n of this._nodes) {
      try { n.osc.stop(); } catch {}
      try { n.lfo.stop(); } catch {}
      try { n.osc.disconnect(); } catch {}
      try { n.gain.disconnect(); } catch {}
      try { n.lfo.disconnect(); } catch {}
      try { n.lfoGain.disconnect(); } catch {}
    }
    this._nodes = [];
  },

  _startClock() {
    this._stopClock();
    this._timer = setInterval(() => {
      const track = this.TRACKS[this.index];
      this.elapsed = (this.elapsed + 1) % track.duration;
      this._renderTime();
    }, 1000);
  },

  _stopClock() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  _renderTrack() {
    this.trackEl.textContent = this.TRACKS[this.index].name;
  },

  _renderTime() {
    const track = this.TRACKS[this.index];
    this.timeEl.textContent = `${this._fmt(this.elapsed)} / ${this._fmt(track.duration)}`;
    this.progressEl.value = String(Math.round((this.elapsed / track.duration) * 100));
  },

  _fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  },
};
