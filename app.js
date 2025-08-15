// Alien Console v3 — app.js (Fixed)
(() => {
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min=0, max=1) => Math.random() * (max - min) + min;

  // Global variables declared first
  let globalVolume = 0.6;
  let audio = null;
  let nodes = {};
  let playing = true;
  let step = 0;
  let stepTimer = 0;
  let cells = [];
  let nebulaLevel = 0.2;
  let drone = { o: null, g: null };
  let anaBuf = new Uint8Array(512);

  // Audio setup functions
  function audioCtx(){
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      const master = audio.createGain();
      master.gain.value = globalVolume * 1.5;
      master.connect(audio.destination);

      const analyser = audio.createAnalyser();
      analyser.fftSize = 1024;
      analyser.connect(master);

      const dry = audio.createGain(); dry.connect(analyser);
      const wet = audio.createGain(); wet.gain.value = 0.35; wet.connect(analyser);
      const shaper = audio.createWaveShaper(); shaper.curve = makeDistCurve(10); shaper.oversample = '4x';
      const filter = audio.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value = 1800; filter.Q.value = 1.2;
      const delay = audio.createDelay(1.0); delay.delayTime.value = 0.18;
      const feedback = audio.createGain(); feedback.gain.value = 0.35;
      const delayWet = audio.createGain(); delayWet.gain.value = 1.0;
      const convolver = audio.createConvolver(); convolver.buffer = makeImpulse(audio, 2.2, 0.5);
      const reverbWet = audio.createGain(); reverbWet.gain.value = 0.2;

      shaper.connect(filter);
      filter.connect(delay);
      delay.connect(feedback); feedback.connect(delay);
      delay.connect(delayWet);
      delayWet.connect(wet);
      filter.connect(convolver);
      convolver.connect(reverbWet);
      reverbWet.connect(wet);

      nodes = { master, analyser, dry, wet, shaper, filter, delay, feedback, delayWet, convolver, reverbWet };
    }
    return audio;
  }

  function makeDistCurve(amount=20) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i=0; i<n_samples; ++i) {
      const x = i * 2 / n_samples - 1;
      curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  function makeImpulse(ac, seconds=2, decay=0.5) {
    const rate = ac.sampleRate;
    const len = rate * seconds;
    const buf = ac.createBuffer(2, len, rate);
    for (let c=0; c<2; c++) {
      const data = buf.getChannelData(c);
      for (let i=0; i<len; i++) {
        data[i] = (Math.random()*2-1) * Math.pow(1 - i/len, decay);
      }
    }
    return buf;
  }

  function playTone(freq=440, env={a:.01,d:.08,r:.18}, opts={}){
    try {
      const ac = audioCtx();
      const n = nodes;
      const o = ac.createOscillator();
      o.type = opts.type || 'sine';
      o.frequency.setValueAtTime(freq, ac.currentTime);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, ac.currentTime);
      const peak = 0.1 + (opts.vel || 0)*0.15; // Louder
      g.gain.linearRampToValueAtTime(peak, ac.currentTime + (env.a ?? .01));
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + (env.a ?? .01) + (env.d ?? .08) + (env.r ?? .18));
      o.connect(g);
      g.connect(nodes.dry);
      g.connect(nodes.shaper);
      o.start();
      o.stop(ac.currentTime + 1.0);
      scopePulse();
    } catch(e) { console.warn('Audio error:', e); }
  }

  function blip(freq=440, attack=0.01, release=0.05){
    playTone(freq, {a:attack, d:0.02, r:release}, {type: Math.random()<0.5?'triangle':'sine', vel:0.4});
  }

  function vibrate(pattern){ if (navigator.vibrate) navigator.vibrate(pattern); }

  // Scope functions
  const scope = $('#scope');
  const sctx = scope?.getContext('2d');
  const scopeState = {
    t: 0,
    pulses: [],
    mode: 'wave',
    zoom: 1,
    speed: 1,
    freeze: false
  };

  function scopePulse() {
    if (!scope) return;
    const w = scope.width;
    scopeState.pulses.push({ x: Math.floor(rand(0, w)), life: 0.8 });
  }

  function noise1D(x, t) {
    return Math.sin(x*1.3 + t) + Math.sin(x*0.7 - t*0.7) * 0.5;
  }

  function scopeDraw() {
    if (!scope || !sctx) return;
    const w = scope.width, h = scope.height;
    sctx.clearRect(0,0,w,h);

    // Grid
    sctx.globalAlpha = 0.2;
    sctx.strokeStyle = 'rgba(255,255,255,0.15)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    for(let x=0; x<w; x+=20){ sctx.moveTo(x,0); sctx.lineTo(x,h); }
    for(let y=0; y<h; y+=20){ sctx.moveTo(0,y); sctx.lineTo(w,y); }
    sctx.stroke();

    if (!scopeState.freeze) {
      sctx.globalAlpha = 1;
      sctx.lineWidth = 2;
      const grad = sctx.createLinearGradient(0,0,w,0);
      grad.addColorStop(0, 'hsla(180,100%,70%,.95)');
      grad.addColorStop(1, 'hsla(300,100%,70%,.95)');
      sctx.strokeStyle = grad;
      sctx.beginPath();

      const flux = Number(getComputedStyle(document.documentElement).getPropertyValue('--flux')) || 0.5;
      const phase = Number(getComputedStyle(document.documentElement).getPropertyValue('--phase')) || 0.3;
      const gain = Number(getComputedStyle(document.documentElement).getPropertyValue('--gain')) || 0.7;

      // Different visualization modes
      switch(scopeState.mode) {
        case 'wave':
          drawWaveform(w, h, flux, phase, gain);
          break;
        case 'freq':
          drawFrequencyBars(w, h, flux, phase, gain);
          break;
        case 'lissa':
          drawLissajous(w, h, flux, phase, gain);
          break;
        case 'spiral':
          drawSpiral(w, h, flux, phase, gain);
          break;
      }
      sctx.stroke();
    }

    // Pulse effects
    for (let i = scopeState.pulses.length -1; i >= 0; i--) {
      const p = scopeState.pulses[i];
      p.life -= 0.02;
      if (p.life <= 0) { scopeState.pulses.splice(i,1); continue; }
      sctx.globalAlpha = p.life;
      sctx.fillStyle = 'rgba(255,255,255,.6)';
      sctx.fillRect(p.x, 0, 2, h);
    }

    if (!scopeState.freeze) {
      scopeState.t += scopeState.speed;
    }
    requestAnimationFrame(scopeDraw);
  }

  function drawWaveform(w, h, flux, phase, gain) {
    const amp = lerp(20, h*0.35, gain) * scopeState.zoom;
    const freq = lerp(1, 8, flux);
    for(let x=0; x<w; x++){
      const t = (x / w) * Math.PI * 2 * freq + scopeState.t * 0.05 + phase * 6.28;
      const y = h/2 + Math.sin(t) * amp + (Math.sin(t*2.71+2) * 4) + noise1D(x*0.05, scopeState.t*0.02)*3;
      if (x===0) sctx.moveTo(x,y); else sctx.lineTo(x,y);
    }
  }

  function drawFrequencyBars(w, h, flux, phase, gain) {
    const bars = Math.floor(w / 8);
    for(let i=0; i<bars; i++){
      const x = i * 8;
      const freq = i / bars * 10 + flux * 5;
      const barHeight = Math.sin(scopeState.t * 0.02 + freq + phase * 3) * h * 0.4 * gain * scopeState.zoom;
      sctx.fillRect(x, h/2 - barHeight/2, 6, barHeight);
    }
  }

  function drawLissajous(w, h, flux, phase, gain) {
    const points = 200;
    for(let i=0; i<points; i++){
      const t = (i / points) * Math.PI * 4 + scopeState.t * 0.02;
      const freqX = 1 + flux * 3;
      const freqY = 1 + phase * 4;
      const x = w/2 + Math.sin(t * freqX) * w * 0.3 * gain * scopeState.zoom;
      const y = h/2 + Math.cos(t * freqY) * h * 0.3 * gain * scopeState.zoom;
      if (i===0) sctx.moveTo(x,y); else sctx.lineTo(x,y);
    }
  }

  function drawSpiral(w, h, flux, phase, gain) {
    const points = 300;
    for(let i=0; i<points; i++){
      const t = (i / points) * Math.PI * 8 + scopeState.t * 0.02;
      const radius = (i / points) * Math.min(w, h) * 0.4 * gain * scopeState.zoom;
      const freq = flux * 5 + 1;
      const x = w/2 + Math.cos(t * freq + phase * 6.28) * radius;
      const y = h/2 + Math.sin(t * freq + phase * 6.28) * radius;
      if (i===0) sctx.moveTo(x,y); else sctx.lineTo(x,y);
    }
  }

  // Nebula setup
  const neb = $('#nebula');
  const nctx = neb?.getContext('2d');
  const nebula = {
    pts: [], time: 0,
    init() {
      if (!neb) return;
      const w = neb.width, h = neb.height;
      this.pts = Array.from({length: 220}, () => ({
        x: rand(0,w), y: rand(0,h),
        vx: rand(-0.3,0.3), vy: rand(-0.3,0.3),
        hue: Math.floor(rand(0,360))
      }));
    },
    draw(level=0.5) {
      if (!neb || !nctx) return;
      const w = neb.width, h = neb.height;
      nctx.clearRect(0,0,w,h);
      for (const p of this.pts) {
        p.x += p.vx + Math.sin(this.time*0.01 + p.y*0.02) * 0.2 * (0.5 + level);
        p.y += p.vy + Math.cos(this.time*0.01 + p.x*0.02) * 0.2 * (0.5 + level);
        if (p.x<0) p.x+=w; if (p.x>w) p.x-=w; if (p.y<0) p.y+=h; if (p.y>h) p.y-=h;
        nctx.globalAlpha = 0.6;
        nctx.fillStyle = `hsl(${p.hue} 100% ${40+level*40}%)`;
        nctx.beginPath();
        nctx.arc(p.x, p.y, 1.6 + level*2.2, 0, Math.PI*2);
        nctx.fill();
      }
      this.time++;
      requestAnimationFrame(() => this.draw(nebulaLevel));
    }
  };

  function analyserTap(){
    if (!audio || !nodes.analyser) return;
    nodes.analyser.getByteFrequencyData(anaBuf);
    let sum = 0;
    for (let i=0; i<anaBuf.length; i++) sum += anaBuf[i];
    nebulaLevel = sum / (anaBuf.length * 255);
  }

  // Note functions
  function noteFor(row) {
    const scale = [0, 3, 5, 7, 10];
    const base = 220;
    const idx = row % scale.length;
    const octave = Math.floor(row / scale.length);
    const semitones = scale[idx] + 12 * octave;
    return base * Math.pow(2, semitones / 12);
  }

  function noteForExpanded(row, col) {
    const scales = [
      [0, 2, 4, 5, 7, 9, 11], // Major scale
      [0, 2, 3, 5, 7, 8, 10], // Natural minor
      [0, 1, 4, 5, 7, 8, 11], // Harmonic minor
      [0, 2, 3, 6, 7, 8, 11]  // Dorian
    ];
    const scaleIdx = Math.floor(row / 3) % scales.length;
    const scale = scales[scaleIdx];
    const base = 110 + (col * 20);
    const noteIdx = row % scale.length;
    const octave = Math.floor(row / scale.length);
    const semitones = scale[noteIdx] + 12 * octave;
    return base * Math.pow(2, semitones / 12);
  }

  function alienGlyphSVG() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('fill', 'none');
    g.setAttribute('stroke', 'white');
    g.setAttribute('stroke-width', '6');
    g.setAttribute('stroke-linecap', 'round');
    const layers = 3 + Math.floor(Math.random()*3);
    for(let i=0; i<layers; i++){
      const path = document.createElementNS(ns, 'path');
      const cmds = [];
      let x = rand(10,90), y = rand(10,90);
      cmds.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
      const segs = 3 + Math.floor(Math.random()*5);
      for (let s=0; s<segs; s++) {
        x = clamp(x + rand(-30,30), 10, 90);
        y = clamp(y + rand(-30,30), 10, 90);
        if (Math.random() < 0.6) {
          const cx = clamp(x + rand(-20,20), 10, 90);
          const cy = clamp(y + rand(-20,20), 10, 90);
          cmds.push(`Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`);
        } else {
          cmds.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
        }
      }
      path.setAttribute('d', cmds.join(' '));
      path.setAttribute('stroke', `hsl(${Math.floor(rand(0,360))} 100% 70%)`);
      path.setAttribute('opacity', 0.9);
      g.appendChild(path);
    }
    svg.appendChild(g);
    return svg;
  }

  // Initialize everything after DOM is ready
  function initializeConsole() {
    // Theme switching
    const themeChips = $$('.chip');
    const setTheme = (name) => {
      document.body.dataset.theme = name;
      themeChips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.theme === name)));
    };
    themeChips.forEach(c => c.addEventListener('click', () => setTheme(c.dataset.theme)));
    setTheme('neon');

    // Help dialog
    const help = $('#help');
    $('#btn-help')?.addEventListener('click', () => help.open ? help.close() : help.showModal());
    $('#btn-randomize')?.addEventListener('click', () => randomizeAll());

    // Wormhole control
    const worm = $('#worm');
    const updateWorm = () => {
      const t = Number(worm.value) / 100;
      document.documentElement.style.setProperty('--worm', t.toFixed(3));
    };
    worm?.addEventListener('input', updateWorm);
    updateWorm();

    // Energy core
    const core = $('#core');
    const rings = $$('.ring');
    core?.addEventListener('click', () => {
      const pressed = core.getAttribute('aria-pressed') === 'true';
      core.setAttribute('aria-pressed', String(!pressed));
      blip(lerp(220, 880, Math.random()), 0.05);
      vibrate([5, 10, 5]);
    });

    rings.forEach((ring, idx) => {
      ring.style.pointerEvents = 'auto';
      let dragging = false, lastX = 0, angle = (idx === 0 ? 0 : idx === 1 ? 15 : -25);
      ring.addEventListener('pointerdown', e => {
        dragging = true; lastX = e.clientX; ring.setPointerCapture(e.pointerId);
      });
      ring.addEventListener('pointerup', e => {
        dragging = false; try { ring.releasePointerCapture(e.pointerId); } catch(e){}
      });
      ring.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        angle += dx * 0.5;
        ring.style.transform = `rotate(${angle}deg)`;
        blip(lerp(160, 400, Math.random()), 0.005, 0.03);
      });
    });

    // Knobs
    const knobElems = $$('.knob');
    const setKnobAngle = (knob, t) => {
      t = clamp(t, 0, 1);
      const min = Number(knob.dataset.min) || -135;
      const max = Number(knob.dataset.max) || 135;
      const angle = lerp(min, max, t);
      knob.style.setProperty('--angle', `${angle}deg`);
      knob.dataset.value = t.toFixed(3);
      if (knob.dataset.var) {
        document.documentElement.style.setProperty(knob.dataset.var, t.toFixed(3));
      }
    };

    knobElems.forEach(knob => {
      setKnobAngle(knob, Number(knob.dataset.value || 0.5));
      let dragging = false, startY = 0, startVal = Number(knob.dataset.value || 0.5);

      knob.addEventListener('pointerdown', e => {
        dragging = true;
        startY = e.clientY;
        startVal = Number(knob.dataset.value || 0.5);
        knob.setPointerCapture(e.pointerId);
      });

      const move = e => {
        if (!dragging) return;
        const dy = e.clientY - startY;
        const scale = e.shiftKey ? 0.001 : 0.003;
        const t = clamp(startVal - dy * scale, 0, 1);
        setKnobAngle(knob, t);
        scopePulse();
      };

      const up = e => {
        dragging = false;
        try { knob.releasePointerCapture(e.pointerId); } catch(e){}
      };

      knob.addEventListener('pointermove', move);
      knob.addEventListener('pointerup', up);
      knob.addEventListener('dblclick', () => setKnobAngle(knob, 0.5));
    });

    // Master Volume Control
    const masterVolume = $('#master-volume');
    const setMasterAngle = (knob, t) => {
      t = clamp(t, 0, 1);
      const angle = lerp(-135, 135, t);
      knob.style.setProperty('--angle', `${angle}deg`);
      knob.dataset.value = t.toFixed(3);
      globalVolume = t;
      document.documentElement.style.setProperty('--master-volume', t.toFixed(3));
      if (nodes.master) {
        nodes.master.gain.setTargetAtTime(globalVolume * 1.5, audioCtx().currentTime, 0.1);
      }
    };

    if (masterVolume) {
      setMasterAngle(masterVolume, 0.6);
      let dragging = false, startY = 0, startVal = 0.6;

      masterVolume.addEventListener('pointerdown', e => {
        dragging = true;
        startY = e.clientY;
        startVal = Number(masterVolume.dataset.value || 0.6);
        masterVolume.setPointerCapture(e.pointerId);
      });

      const move = e => {
        if (!dragging) return;
        const dy = e.clientY - startY;
        const scale = e.shiftKey ? 0.001 : 0.003;
        const t = clamp(startVal - dy * scale, 0, 1);
        setMasterAngle(masterVolume, t);
      };

      const up = e => {
        dragging = false;
        try { masterVolume.releasePointerCapture(e.pointerId); } catch(e){}
      };

      masterVolume.addEventListener('pointermove', move);
      masterVolume.addEventListener('pointerup', up);
      masterVolume.addEventListener('dblclick', () => setMasterAngle(masterVolume, 0.6));
    }

    // Toggles
    const toggles = $$('.toggle input');
    const updateSwitchGlow = () => {
      const f = Number(getComputedStyle(document.documentElement).getPropertyValue('--flux')) || 0.5;
      toggles.forEach((t, i) => t.style.filter = `drop-shadow(0 0 ${8 + f*8}px hsl(var(--glow) / .6))`);
    };
    updateSwitchGlow();
    toggles.forEach(t => t.addEventListener('change', () => {
      blip(t.checked ? 520 : 180, 0.02);
      updateSwitchGlow();
    }));

    // Sliders
    $$('.vslider input').forEach(sl => {
      sl.addEventListener('input', () => {
        if (Math.random() < 0.1) blip(lerp(120, 980, sl.value/100), 0.01, 0.04);
        scopePulse();
      });
    });

    // 12x12 Matrix
    const matrix = $('.matrix-grid');
    if (matrix) {
      const rows = 12, cols = 12;
      matrix.style.gridTemplateColumns = 'repeat(12, 1fr)';
      matrix.setAttribute('aria-label', '12x12 matrix');

      for (let r=0; r<rows; r++) {
        for (let c=0; c<cols; c++) {
          const div = document.createElement('button');
          div.className = 'cell';
          div.setAttribute('aria-pressed', 'false');
          div.dataset.r = r;
          div.dataset.c = c;

          const hasProbability = Math.random() < 0.3;
          if (hasProbability) {
            div.classList.add('probability');
            div.dataset.probability = (0.5 + Math.random() * 0.5).toFixed(2);
          }

          div.addEventListener('click', () => {
            const active = div.classList.toggle('active');
            div.setAttribute('aria-pressed', String(active));
            if (active) {
              const freq = noteForExpanded(r, c);
              const waveform = ['sine', 'triangle', 'square', 'sawtooth'][Math.floor(Math.random() * 4)];
              playTone(freq, {a:.005, d:.03, r:.15}, {type: waveform, vel: 0.6});
            }
          });
          matrix.appendChild(div);
          cells.push(div);
        }
      }
    }

    // Matrix controls
    const tempo = $('#tempo');
    const swing = $('#swing');
    $('#btn-play')?.addEventListener('click', () => {
      playing = !playing;
      const btn = $('#btn-play');
      if (btn) btn.textContent = playing ? 'Pause' : 'Play';
    });

    // Enhanced stepMatrix function
    function stepMatrix(dt){
      if (!playing || cells.length === 0) return;
      stepTimer += dt;
      const bpm = Number(tempo?.value || 120);
      const beatMs = 60000 / bpm;
      const swingAmt = Number(swing?.value || 0) / 100;
      const even = step % 2 === 1;
      const currentBeat = beatMs * (even ? (1 + swingAmt*0.4) : (1 - swingAmt*0.4));

      if (stepTimer >= currentBeat) {
        cells.filter(c => Number(c.dataset.c) === step).forEach(c => c.classList.remove('step'));
        stepTimer = 0;
        step = (step + 1) % 12; // Use 12 columns

        const activeInStep = cells.filter(c =>
          Number(c.dataset.c) === step && c.classList.contains('active')
        );

        cells.filter(c => Number(c.dataset.c) === step).forEach(c => c.classList.add('step'));

        activeInStep.forEach(c => {
          const shouldTrigger = c.classList.contains('probability') ?
            Math.random() < Number(c.dataset.probability) : true;

          if (shouldTrigger) {
            const freq = noteForExpanded(Number(c.dataset.r), Number(c.dataset.c));
            const waveform = ['sine', 'triangle', 'square', 'sawtooth'][Math.floor(Math.random() * 4)];
            playTone(freq, {a:.003, d:.02, r:.12}, {
              type: waveform,
              vel: 0.4 + Math.random() * 0.3
            });
          }
        });

        if (activeInStep.length) scopePulse();
      }
    }

    // Drone pad
    const dronePad = $('#drone-pad');
    const droneCursor = dronePad?.querySelector('.cursor');
    const droneHold = $('#drone-hold');
    const droneWave = $('#drone-wave');
    const droneVol = $('#drone-vol');

    const droneBounds = () => dronePad?.getBoundingClientRect();

    function startDrone(x, y){
      if (!dronePad) return;
      const ac = audioCtx();
      if (drone.o) stopDrone();
      drone.o = ac.createOscillator();
      drone.o.type = droneWave?.value || 'sine';
      drone.g = ac.createGain();
      drone.g.gain.value = Number(droneVol?.value || 40)/100 * 0.4; // Louder
      drone.o.connect(drone.g);
      drone.g.connect(nodes.dry);
      drone.g.connect(nodes.shaper);
      drone.o.start();
      moveDrone(x, y);
    }

    function moveDrone(x, y){
      if (!drone.o || !dronePad) return;
      const b = droneBounds();
      if (!b) return;
      const nx = clamp((x - b.left) / b.width, 0, 1);
      const ny = clamp((y - b.top) / b.height, 0, 1);
      const ac = audioCtx();
      const freq = lerp(110, 1200, nx*nx);
      const cutoff = lerp(400, 7000, 1-ny);
      drone.o.frequency.setTargetAtTime(freq, ac.currentTime, 0.01);
      if (nodes.filter) {
        nodes.filter.frequency.setTargetAtTime(cutoff, ac.currentTime, 0.05);
      }
      if (droneCursor) {
        droneCursor.style.left = `${nx*100}%`;
        droneCursor.style.top = `${ny*100}%`;
      }
      scopePulse();
    }

    function stopDrone(){
      if (!drone.o) return;
      try { drone.o.stop(); } catch(e){}
      try { drone.o.disconnect(); } catch(e){}
      try { drone.g.disconnect(); } catch(e){}
      drone = { o:null, g:null };
    }

    dronePad?.addEventListener('pointerdown', e => {
      dronePad.setPointerCapture(e.pointerId);
      startDrone(e.clientX, e.clientY);
    });

    dronePad?.addEventListener('pointermove', e => {
      if (drone.o) moveDrone(e.clientX, e.clientY);
    });

    dronePad?.addEventListener('pointerup', e => {
      if (!droneHold?.checked) stopDrone();
      try { dronePad.releasePointerCapture(e.pointerId); } catch(e){}
    });

    droneWave?.addEventListener('change', () => {
      if (drone.o) drone.o.type = droneWave.value;
    });

    droneVol?.addEventListener('input', () => {
      if (drone.g) drone.g.gain.value = Number(droneVol.value)/100 * 0.4;
    });

    // Tone pads
    $$('.tone').forEach(btn => {
      btn.addEventListener('click', () => {
        const mul = Number(btn.dataset.mul);
        const base = 220 * Math.pow(2, Math.floor(rand(0,2)));
        const f = base * mul;
        playTone(f, {a:.01,d:.08,r:.4}, {type:'sine', vel:.6});
        playTone(f*2.01, {a:.02,d:.12,r:.5}, {type:'triangle', vel:.4});
      });
    });

    // Enhanced Glyph Pad
    const glyphPad = $('.keypad .pad');
    if (glyphPad) {
      for(let i=0; i<12; i++){
        const b = document.createElement('button');
        b.className = 'glyph';
        const svg = alienGlyphSVG();
        svg.classList.add('glyph__icon');
        b.appendChild(svg);

        b.addEventListener('click', () => {
          b.classList.add('playing');
          const baseFreq = lerp(220, 1760, i/12);

          // Harmonic series triggering
          const harmonics = [1, 1.25, 1.5, 2, 2.5, 3];
          harmonics.forEach((harm, idx) => {
            setTimeout(() => {
              const f = baseFreq * harm;
              const waveform = ['sine', 'triangle', 'square', 'sawtooth'][idx % 4];
              playTone(f, {a:.005, d:.02 + idx*0.01, r:.15 + idx*0.05}, {
                type: waveform,
                vel: 0.5 / (idx + 1)
              });
            }, idx * 20);
          });

          // Morph the glyph
          setTimeout(() => {
            const newSvg = alienGlyphSVG();
            newSvg.classList.add('glyph__icon');
            const oldIcon = b.querySelector('.glyph__icon');
            if (oldIcon) b.replaceChild(newSvg, oldIcon);
          }, 100);

          setTimeout(() => b.classList.remove('playing'), 300);
        });

        glyphPad.appendChild(b);
      }
    }

    // Terminal
    const crt = $('.terminal .crt');
    function line(str) {
      if (!crt) return;
      const el = document.createElement('div');
      el.className = 'line';
      el.innerHTML = str;
      crt.appendChild(el);
      crt.scrollTop = crt.scrollHeight;
    }

    const tags = ['COIL', 'NAV', 'ION', 'RNG', 'WORM', 'CLS', 'SHD', 'GTE', 'ANC', 'FLUX', 'PHASE'];
    function randomStatus() {
      const tag = tags[Math.floor(Math.random()*tags.length)];
      const v = (Math.random() < 0.5) ?
        `${(rand(0,100)).toFixed(2)}%` :
        `${(rand(100,999)).toFixed(0)}.${(rand(0,99)|0)}`;
      const status = Math.random() < 0.5 ? 'STABLE' : (Math.random()<0.5 ? 'FLUX' : 'PHASE');
      line(`<span class="tag">[${tag}]</span> <span class="val">${v}</span> :: ${status}`);
    }
    setInterval(randomStatus, 1400);
    randomStatus();

    // FX Controls
    const fx = {
      cutoff: $('#fx-cutoff'), q: $('#fx-q'), delay: $('#fx-delay'),
      feedback: $('#fx-feedback'), reverb: $('#fx-reverb'), dist: $('#fx-dist'), mix: $('#fx-mix')
    };

    const bindFX = () => {
      const ac = audioCtx();
      const apply = () => {
        if (nodes.filter) {
          nodes.filter.frequency.setTargetAtTime(Number(fx.cutoff?.value || 1800), ac.currentTime, 0.02);
          nodes.filter.Q.setTargetAtTime(Number(fx.q?.value || 1.2), ac.currentTime, 0.02);
        }
        if (nodes.delay) {
          nodes.delay.delayTime.setTargetAtTime(Number(fx.delay?.value || 0.18), ac.currentTime, 0.02);
        }
        if (nodes.feedback) {
          nodes.feedback.gain.setTargetAtTime(Number(fx.feedback?.value || 0.35), ac.currentTime, 0.02);
        }
        if (nodes.reverbWet) {
          nodes.reverbWet.gain.setTargetAtTime(Number(fx.reverb?.value || 0.2), ac.currentTime, 0.02);
        }
        if (nodes.wet) {
          nodes.wet.gain.setTargetAtTime(Number(fx.mix?.value || 0.35), ac.currentTime, 0.02);
        }
        if (nodes.shaper) {
          nodes.shaper.curve = makeDistCurve(Number(fx.dist?.value || 10));
        }
      };
      Object.values(fx).forEach(inp => inp?.addEventListener('input', apply));
      apply();
    };

    // LFO
    const lfo = {
      rate: $('#lfo-rate'),
      depth: $('#lfo-depth'),
      toCutoff: $('#lfo-cutoff'),
      toGain: $('#lfo-gain'),
      toDelay: $('#lfo-delay'),
      phase: 0
    };

    function lfoTick(dt){
      const ac = audioCtx();
      const rate = Number(lfo.rate?.value || 2.4);
      const depth = Number(lfo.depth?.value || 0.4);
      lfo.phase += dt * rate * 0.006;
      const v = Math.sin(lfo.phase * Math.PI * 2) * depth;

      if (lfo.toCutoff?.checked && nodes.filter && fx.cutoff) {
        const base = Number(fx.cutoff.value);
        nodes.filter.frequency.setTargetAtTime(clamp(base * (1 + v*0.6), 100, 10000), ac.currentTime, 0.02);
      }
      if (lfo.toDelay?.checked && nodes.delay && fx.delay) {
        const base = Number(fx.delay.value);
        nodes.delay.delayTime.setTargetAtTime(clamp(base + v*0.12, 0, 0.9), ac.currentTime, 0.02);
      }
      if (lfo.toGain?.checked && nodes.master) {
        const base = globalVolume * 1.5;
        nodes.master.gain.setTargetAtTime(clamp(base * (1 + v*0.3), 0.1, 2.0), ac.currentTime, 0.03);
      }
    }

    // Initialize new alien panels
    initAlienPanels();

    // Main tick function
    let last = performance.now();
    function tick(now) {
      const dt = now - last;
      last = now;
      stepMatrix(dt);
      lfoTick(dt);
      analyserTap();
      requestAnimationFrame(tick);
    }

    // Randomize function
    function randomizeAll(){
      toggles.forEach(t => {
        t.checked = Math.random() < 0.6;
        t.dispatchEvent(new Event('change'));
      });

      $$('.vslider input').forEach(sl => {
        sl.value = Math.floor(rand(10,90));
        sl.dispatchEvent(new Event('input'));
      });

      knobElems.forEach(kn => setKnobAngle(kn, Math.random()));

      cells.forEach(c => {
        const active = Math.random() < 0.25;
        c.classList.toggle('active', active);
        c.setAttribute('aria-pressed', String(active));
      });

      if (fx.cutoff) fx.cutoff.value = Math.floor(lerp(200, 7000, Math.random()));
      if (fx.q) fx.q.value = (Math.random()*10+0.5).toFixed(1);
      if (fx.delay) fx.delay.value = Math.random().toFixed(2);
      if (fx.feedback) fx.feedback.value = Math.random().toFixed(2);
      if (fx.reverb) fx.reverb.value = Math.random().toFixed(2);
      if (fx.dist) fx.dist.value = Math.floor(Math.random()*80);
      if (fx.mix) fx.mix.value = Math.random().toFixed(2);
      bindFX();

      if (lfo.rate) lfo.rate.value = (Math.random()*6+0.2).toFixed(1);
      if (lfo.depth) lfo.depth.value = Math.random().toFixed(2);
      if (lfo.toCutoff) lfo.toCutoff.checked = Math.random() < 0.8;
      if (lfo.toGain) lfo.toGain.checked = Math.random() < 0.4;
      if (lfo.toDelay) lfo.toDelay.checked = Math.random() < 0.5;

      if (worm) {
        worm.value = Math.floor(Math.random()*100);
        updateWorm();
      }
      scopePulse();
    }

    // Global event listeners
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ') { e.preventDefault(); randomizeAll(); }
      if (e.key === '?') { e.preventDefault(); help?.open ? help.close() : help.showModal(); }
    });

    // Initialize audio on first interaction
    ['click','keydown','pointerdown','touchstart'].forEach(ev => {
      window.addEventListener(ev, function once() {
        audioCtx();
        bindFX();
        window.removeEventListener(ev, once, true);
      }, true);
    });

    // Start animations
    nebula.init();
    scopeDraw();
    nebula.draw();
    requestAnimationFrame(tick);
  }

  // Initialize alien panels
  function initAlienPanels() {
    // Biomechanical Sequencer
    const bioMutate = $('#bio-mutate');
    const tentacleGroup = $('.tentacle-group');

    const generateTentacles = () => {
      if (!tentacleGroup) return;
      tentacleGroup.innerHTML = '';
      const numTentacles = 6 + Math.floor(Math.random() * 4);

      for (let i = 0; i < numTentacles; i++) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const startX = rand(50, 350);
        const startY = rand(20, 180);

        let pathData = `M ${startX} ${startY}`;
        let x = startX, y = startY;

        const segments = 4 + Math.floor(Math.random() * 6);
        for (let s = 0; s < segments; s++) {
          const dx = rand(-60, 60);
          const dy = rand(-40, 40);
          x = clamp(x + dx, 10, 390);
          y = clamp(y + dy, 10, 190);

          const cx1 = x + rand(-30, 30);
          const cy1 = y + rand(-20, 20);
          pathData += ` Q ${cx1} ${cy1} ${x} ${y}`;
        }

        path.setAttribute('d', pathData);
        path.setAttribute('stroke', `hsl(${120 + i*30} 80% 60%)`);
        path.setAttribute('stroke-width', '3');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.8');
        path.style.filter = `drop-shadow(0 0 8px hsl(${120 + i*30} 80% 60%))`;

        tentacleGroup.appendChild(path);
      }
    };

    bioMutate?.addEventListener('click', () => {
      generateTentacles();
      blip(rand(200, 800), 0.01, 0.1);
    });
    generateTentacles();

    // Crystalline Resonator
    const crystalFaces = $$('.crystal-face');
    const crystalContainer = $('.crystal-container');

    crystalFaces.forEach((face, idx) => {
      const filterTypes = ['lowpass', 'highpass', 'bandpass', 'notch'];
      face.addEventListener('click', () => {
        const filterType = filterTypes[idx];
        if (nodes.filter) {
          nodes.filter.type = filterType;
        }

        const fractures = crystalContainer?.querySelector('.crystal-fractures');
        if (fractures) {
          fractures.style.opacity = '1';
          setTimeout(() => {
            fractures.style.opacity = '0';
          }, 1000);
        }

        const baseFreq = 440 * (idx + 1);
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            playTone(baseFreq * Math.pow(2, i/12), {a:.05, d:.2, r:.8}, {
              type: 'sine', vel: 0.4
            });
          }, i * 100);
        }
        blip(baseFreq, 0.01, 0.3);
      });
    });

    // Quantum Entanglement Hub
    const qubits = $$('.qubit');
    const entangledPairs = new Map();

    qubits.forEach(qubit => {
      const entangled = qubit.dataset.entangled;
      if (!entangledPairs.has(entangled)) {
        entangledPairs.set(entangled, []);
      }
      entangledPairs.get(entangled).push(qubit);

      qubit.addEventListener('click', () => {
        const uncertainty = Math.random() * 0.3;
        const entangledGroup = entangledPairs.get(entangled);

        entangledGroup.forEach(q => {
          const qParam = q.dataset.param;
          const element = $(`#fx-${qParam}`) || $(`#lfo-${qParam}`);

          if (element && element.type === 'range') {
            const currentVal = Number(element.value);
            const min = Number(element.min) || 0;
            const max = Number(element.max) || 100;
            const newVal = clamp(currentVal + (rand(-1, 1) * uncertainty * (max - min)), min, max);
            element.value = newVal;
            element.dispatchEvent(new Event('input'));
          }

          q.style.transform = `scale(${1 + uncertainty}) rotate(${rand(0, 360)}deg)`;
          setTimeout(() => {
            q.style.transform = '';
          }, 500);
        });

        playTone(rand(200, 1200), {a:.001, d:.05, r:.2}, {
          type: 'sine', vel: 0.3
        });
      });
    });

    // Alien Atmosphere Generator
    const solarWind = $('#solar-wind');
    const ionStorm = $('#ion-storm');
    const gravity = $('#gravity');

    [solarWind, ionStorm, gravity].forEach(control => {
      control?.addEventListener('input', () => {
        blip(rand(200, 600), 0.005, 0.1);
        scopePulse();
      });
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeConsole);
  } else {
    initializeConsole();
  }

  // Enhanced Scope Controls
  const scopeControls = {
    modeButtons: $$('.visual-mode-selector button'),
    zoom: $('#scope-zoom'),
    speed: $('#scope-speed'),
    nebulaCount: $('#nebula-count'),
    nebulaChaos: $('#nebula-chaos'),
    freeze: $('#scope-freeze'),
    nebulaReact: $('#nebula-react'),
    pulse: $('#scope-pulse')
  };

  // Scope mode switching
  scopeControls.modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      scopeControls.modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      scopeState.mode = btn.id.replace('scope-mode-', '');
      scopePulse();
      blip(rand(300, 800), 0.005, 0.05);
    });
  });

  // Scope parameter controls
  scopeControls.zoom?.addEventListener('input', () => {
    scopeState.zoom = Number(scopeControls.zoom.value);
    scopePulse();
  });

  scopeControls.speed?.addEventListener('input', () => {
    scopeState.speed = Number(scopeControls.speed.value);
  });

  scopeControls.freeze?.addEventListener('change', () => {
    scopeState.freeze = scopeControls.freeze.checked;
    blip(scopeState.freeze ? 200 : 400, 0.01, 0.05);
  });

  scopeControls.pulse?.addEventListener('click', () => {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => scopePulse(), i * 50);
    }
    blip(rand(400, 1200), 0.02, 0.1);
  });

  // Enhanced Nebula Controls
  scopeControls.nebulaCount?.addEventListener('input', () => {
    const count = Number(scopeControls.nebulaCount.value);
    nebula.pts = Array.from({length: count}, () => ({
      x: rand(0, neb?.width || 640),
      y: rand(0, neb?.height || 120),
      vx: rand(-0.3, 0.3),
      vy: rand(-0.3, 0.3),
      hue: Math.floor(rand(0, 360))
    }));
  });

  scopeControls.nebulaChaos?.addEventListener('input', () => {
    const chaos = Number(scopeControls.nebulaChaos.value);
    nebula.pts.forEach(p => {
      p.vx += rand(-chaos * 0.1, chaos * 0.1);
      p.vy += rand(-chaos * 0.1, chaos * 0.1);
    });
    scopePulse();
  });

  // Enhanced Alien Panel Functionality
  function enhanceAlienPanels() {
    // Bio Sequencer Evolution Control
    const bioEvolution = $('#bio-evolution');
    bioEvolution?.addEventListener('input', () => {
      const evolution = Number(bioEvolution.value) / 100;
      const tentacles = $$('.tentacle-group path');
      tentacles.forEach(tentacle => {
        tentacle.style.strokeWidth = `${2 + evolution * 4}`;
        tentacle.style.opacity = `${0.6 + evolution * 0.4}`;
      });
      if (Math.random() < evolution) {
        blip(rand(100, 400), 0.001, 0.2);
      }
    });

    // Crystal Resonator - Auto-rotate crystal
    const crystal3d = $('#crystal-3d');
    if (crystal3d) {
      let crystalRotation = 0;
      setInterval(() => {
        crystalRotation += 1;
        crystal3d.style.transform = `translate(-50%, -50%) rotateX(${20 + Math.sin(crystalRotation * 0.01) * 10}deg) rotateY(${crystalRotation * 0.5}deg)`;
      }, 50);
    }

    // Atmosphere Generator - Weather effects
    const weatherSystem = $('.weather-system');
    const cosmicRadiation = $('.cosmic-radiation');

    [solarWind, ionStorm, gravity].forEach((control, idx) => {
      control?.addEventListener('input', () => {
        const value = Number(control.value) / 100;

        switch(idx) {
          case 0: // Solar Wind
            if (weatherSystem) {
              weatherSystem.style.animationDuration = `${20 - value * 15}s`;
              weatherSystem.style.opacity = `${0.3 + value * 0.7}`;
            }
            break;
          case 1: // Ion Storm
            if (cosmicRadiation) {
              cosmicRadiation.style.animationDuration = `${5 - value * 3}s`;
              cosmicRadiation.style.opacity = `${0.3 + value * 0.4}`;
            }
            // Ion storm affects global filter
            if (nodes.filter && value > 0.5) {
              const stormFreq = lerp(200, 2000, Math.random());
              nodes.filter.frequency.setTargetAtTime(stormFreq, audioCtx().currentTime, 0.1);
            }
            break;
          case 2: // Gravity
            // Gravity affects global pitch
            if (value !== 0.5) {
              const gravityShift = (value - 0.5) * 0.1;
              document.documentElement.style.setProperty('--gravity-shift', gravityShift.toString());
            }
            break;
        }

        // All atmosphere controls can trigger ambient sounds
        if (Math.random() < value * 0.3) {
          const ambientFreq = rand(80, 300);
          playTone(ambientFreq, {a: 0.2, d: 0.5, r: 1.0}, {type: 'sine', vel: value * 0.2});
        }
      });
    });

    // Quantum Hub - Enhanced entanglement visualization
    qubits.forEach((qubit, idx) => {
      // Add particle trails
      setInterval(() => {
        const trail = document.createElement('div');
        trail.style.position = 'absolute';
        trail.style.width = '4px';
        trail.style.height = '4px';
        trail.style.borderRadius = '50%';
        trail.style.background = `hsl(${180 + idx * 60} 100% 70%)`;
        trail.style.left = qubit.style.left || `${20 + idx * 30}%`;
        trail.style.top = qubit.style.top || `${30 + (idx % 2) * 40}%`;
        trail.style.pointerEvents = 'none';
        trail.style.opacity = '0.8';
        trail.style.transition = 'all 2s ease-out';

        const quantumField = $('.quantum-field');
        if (quantumField) {
          quantumField.appendChild(trail);

          // Animate trail
          setTimeout(() => {
            trail.style.transform = `translate(${rand(-50, 50)}px, ${rand(-50, 50)}px)`;
            trail.style.opacity = '0';
          }, 10);

          // Remove trail
          setTimeout(() => {
            if (trail.parentNode) trail.parentNode.removeChild(trail);
          }, 2000);
        }
      }, 1000 + idx * 500);
    });
  }

  enhanceAlienPanels();

})();
