/**
 * MusicPlayer — SomaFM internet radio streamer.
 * Channels curated for hacker / cyberpunk atmosphere.
 * Uses HTML5 Audio — no API key required.
 */
const MusicPlayer = {
  STATIONS: [
    { id: 'defcon',         name: 'DEF CON Radio',    url: 'https://ice1.somafm.com/defcon-256-mp3',         desc: 'Hacker conference vibes' },
    { id: 'dronezone',      name: 'Drone Zone',       url: 'https://ice1.somafm.com/dronezone-256-mp3',      desc: 'Atmospheric ambient' },
    { id: 'deepspaceone',   name: 'Deep Space One',   url: 'https://ice1.somafm.com/deepspaceone-128-mp3',   desc: 'Deep ambient electronic' },
    { id: 'vaporwaves',     name: 'Vaporwaves',       url: 'https://ice1.somafm.com/vaporwaves-128-mp3',     desc: 'Vaporwave & future funk' },
    { id: 'spacestation',   name: 'Space Station',    url: 'https://ice1.somafm.com/spacestation-128-mp3',   desc: 'Ambient / mid-tempo' },
    { id: 'cliqhop',        name: 'cliqhop idm',      url: 'https://ice1.somafm.com/cliqhop-256-mp3',        desc: 'Beats + intelligent dance' },
    { id: 'thetrip',        name: 'The Trip',         url: 'https://ice1.somafm.com/thetrip-128-mp3',        desc: 'Progressive house / trance' },
    { id: 'missioncontrol', name: 'Mission Control',  url: 'https://ice1.somafm.com/missioncontrol-128-mp3', desc: 'NASA comms over ambient' },
    { id: 'sf1033',         name: 'SF 10:33',         url: 'https://ice1.somafm.com/sf1033-128-mp3',         desc: 'Ambient pirate radio' },
  ],

  index: 0,
  playing: false,
  volume: 0.55,
  _audio: null,
  _nowTimer: null,

  VOLUME_KEY: 'cyberspace-music-volume',
  STATION_KEY: 'cyberspace-music-station',

  init() {
    this.playBtn   = document.getElementById('music-play');
    this.selectEl  = document.getElementById('music-station');
    this.nowEl     = document.getElementById('music-now');
    this.volumeEl  = document.getElementById('music-volume');

    if (!this.playBtn || !this.selectEl || !this.volumeEl) return;

    // Build dropdown options
    this.STATIONS.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = s.name;
      opt.title = s.desc;
      this.selectEl.appendChild(opt);
    });

    // Restore saved volume
    const savedVol = Number(localStorage.getItem(this.VOLUME_KEY));
    if (!Number.isNaN(savedVol) && savedVol >= 0 && savedVol <= 1) this.volume = savedVol;
    this.volumeEl.value = String(Math.round(this.volume * 100));

    // Restore saved station
    const savedStation = localStorage.getItem(this.STATION_KEY);
    if (savedStation) {
      const idx = this.STATIONS.findIndex(s => s.id === savedStation);
      if (idx !== -1) this.index = idx;
    }
    this.selectEl.value = String(this.index);

    this.playBtn.addEventListener('click', () => this.toggle());
    this.selectEl.addEventListener('change', () => {
      this.index = Number(this.selectEl.value);
      localStorage.setItem(this.STATION_KEY, this.STATIONS[this.index].id);
      if (this.playing) this.play();
    });
    this.volumeEl.addEventListener('input', () => {
      this.volume = Number(this.volumeEl.value) / 100;
      localStorage.setItem(this.VOLUME_KEY, String(this.volume));
      if (this._audio) this._audio.volume = this.volume;
    });
  },

  toggle() {
    if (this.playing) this.pause(); else this.play();
  },

  play() {
    const station = this.STATIONS[this.index];
    if (this._audio) {
      this._audio.pause();
      this._audio.src = '';
      this._audio = null;
    }
    this._audio = new Audio(station.url);
    this._audio.crossOrigin = 'anonymous';
    this._audio.volume = this.volume;
    this._audio.play().catch(err => {
      console.warn('[music] Stream blocked or failed:', err.message);
      if (typeof App !== 'undefined') App.toast('Radio stream failed — try clicking play again', 'info');
    });
    this.playing = true;
    this.playBtn.textContent = '⏸';
    localStorage.setItem(this.STATION_KEY, station.id);
    if (this.selectEl) this.selectEl.value = String(this.index);
    this._startNowPlaying();
  },

  pause() {
    if (this._audio) {
      this._audio.pause();
      this._audio.src = '';
      this._audio = null;
    }
    this.playing = false;
    this.playBtn.textContent = '▶';
    this._stopNowPlaying();
  },



  // ── Now-playing metadata from SomaFM API ──

  _startNowPlaying() {
    this._fetchNowPlaying();
    this._stopNowPlaying();
    this._nowTimer = setInterval(() => this._fetchNowPlaying(), 30000);

    // Pause polling when tab is hidden to save bandwidth
    if (!this._visHandler) {
      this._visHandler = () => {
        if (document.hidden) {
          this._stopNowPlaying();
        } else if (this.playing && !this._nowTimer) {
          this._fetchNowPlaying();
          this._nowTimer = setInterval(() => this._fetchNowPlaying(), 30000);
        }
      };
      document.addEventListener('visibilitychange', this._visHandler);
    }
  },

  _stopNowPlaying() {
    if (this._nowTimer) { clearInterval(this._nowTimer); this._nowTimer = null; }
    if (this.nowEl) this.nowEl.textContent = '';
  },

  async _fetchNowPlaying() {
    if (!this.nowEl) return;
    const station = this.STATIONS[this.index];
    try {
      const res = await fetch(`https://api.somafm.com/v2/channels/${station.id}/songs/current.json`);
      if (!res.ok) return;
      const data = await res.json();
      const song = data?.songs?.[0];
      if (song) {
        const artist = song.artist || '';
        const title  = song.title || '';
        this.nowEl.textContent = artist ? `${artist} — ${title}` : title;
        this.nowEl.title = `${artist} — ${title}`;
      }
    } catch {}
  },
};
