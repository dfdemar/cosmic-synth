// Alien Console v2 — app.js
(() => {
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min=0, max=1) => Math.random() * (max - min) + min;

  const themeChips = $$('.chip');
  const setTheme = (name) => {
    document.body.dataset.theme = name;
    themeChips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.theme === name)));
  };
  themeChips.forEach(c => c.addEventListener('click', () => setTheme(c.dataset.theme)));
  setTheme('neon');

  const help = $('#help');
  $('#btn-help').addEventListener('click', () => help.open ? help.close() : help.showModal());
  $('#btn-randomize').addEventListener('click', () => randomizeAll());

  const worm = $('#worm');
  const updateWorm = () => {
    const t = Number(worm.value) / 100;
    document.documentElement.style.setProperty('--worm', t.toFixed(3));
  };
  worm.addEventListener('input', updateWorm);
  updateWorm();

  const core = $('#core');
  const rings = $$('.ring');
  core.addEventListener('click', () => {
    const pressed = core.getAttribute('aria-pressed') === 'true';
    core.setAttribute('aria-pressed', String(!pressed));
    blip(lerp(220, 880, Math.random()), 0.05);
    vibrate([5, 10, 5]);
  });
  rings.forEach((ring, idx) => {
    ring.style.pointerEvents = 'auto';
    let dragging = false, lastX = 0, angle = (idx === 0 ? 0 : idx === 1 ? 15 : -25);
    ring.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; ring.setPointerCapture(e.pointerId); });
    ring.addEventListener('pointerup', e => { dragging = false; ring.releasePointerCapture(e.pointerId); });
    ring.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      angle += dx * 0.5;
      ring.style.transform = `rotate(${angle}deg)`;
      blip(lerp(160, 400, Math.random()), 0.005, 0.03);
    });
  });

  const knobElems = $$('.knob');
  const setKnobAngle = (knob, t) => {
    t = clamp(t, 0, 1);
    const min = Number(knob.dataset.min) || -135;
    const max = Number(knob.dataset.max) || 135;
    const angle = lerp(min, max, t);
    knob.style.setProperty('--angle', `${angle}deg`);
    knob.dataset.value = t.toFixed(3);
    document.documentElement.style.setProperty(knob.dataset.var, t.toFixed(3));
  };
  knobElems.forEach(knob => {
    setKnobAngle(knob, Number(knob.dataset.value || 0.5));
    let dragging = false, startY = 0, startVal = Number(knob.dataset.value || 0.5);
    knob.addEventListener('pointerdown', e => {
      dragging = true; startY = e.clientY; startVal = Number(knob.dataset.value || 0.5);
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
    const up = e => { dragging = false; try { knob.releasePointerCapture(e.pointerId); } catch(e){} };
    knob.addEventListener('pointermove', move);
    knob.addEventListener('pointerup', up);
    knob.addEventListener('dblclick', () => setKnobAngle(knob, 0.5));
  });

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

  $$('.vslider input').forEach(sl => {
    sl.addEventListener('input', () => {
      if (Math.random() < 0.1) blip(lerp(120, 980, sl.value/100), 0.01, 0.04);
      scopePulse();
    });
  });

  const matrix = $('.matrix-grid');
  const rows = 8, cols = 8;
  const cells = [];
  for (let r=0; r<rows; r++) {
    for (let c=0; c<cols; c++) {
      const div = document.createElement('button');
      div.className = 'cell';
      div.setAttribute('aria-pressed', 'false');
      div.dataset.r = r; div.dataset.c = c;
      div.addEventListener('click', () => {
        const active = div.classList.toggle('active');
        div.setAttribute('aria-pressed', String(active));
        if (active) playTone(noteFor(r), {a:.01, d:.05, r:.12, type: Math.random()<0.5?'sine':'triangle'});
      });
      matrix.appendChild(div);
      cells.push(div);
    }
  }
  let playing = true, step = 0, stepTimer = 0;
  const tempo = $('#tempo'), swing = $('#swing');
  $('#btn-play').addEventListener('click', () => {
    playing = !playing; $('#btn-play').textContent = playing ? 'Pause' : 'Play';
  });
  function noteFor(row) {
    const scale = [0, 3, 5, 7, 10];
    const base = 220;
    const idx = row % scale.length;
    const octave = Math.floor(row / scale.length);
    const semitones = scale[idx] + 12 * octave;
    return base * Math.pow(2, semitones / 12);
  }

  const scope = $('#scope');
  const sctx = scope.getContext('2d');
  const scopeState = { t: 0, pulses: [] };
  function scopeDraw() {
    const w = scope.width, h = scope.height;
    sctx.clearRect(0,0,w,h);
    sctx.globalAlpha = 0.2;
    sctx.strokeStyle = 'rgba(255,255,255,0.15)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    for(let x=0; x<w; x+=20){ sctx.moveTo(x,0); sctx.lineTo(x,h); }
    for(let y=0; y<h; y+=20){ sctx.moveTo(0,y); sctx.lineTo(w,y); }
    sctx.stroke();
    sctx.globalAlpha = 1;
    sctx.lineWidth = 2;
    const grad = sctx.createLinearGradient(0,0,w,0);
    grad.addColorStop(0, 'hsla(180,100%,70%,.95)');
    grad.addColorStop(1, 'hsla(300,100%,70%,.95)');
    sctx.strokeStyle = grad;
    sctx.beginPath();
    const flux = Number(getComputedStyle(document.documentElement).getPropertyValue('--flux'));
    const phase = Number(getComputedStyle(document.documentElement).getPropertyValue('--phase'));
    const gain = Number(getComputedStyle(document.documentElement).getPropertyValue('--gain'));
    const amp = lerp(20, h*0.35, gain);
    const freq = lerp(1, 8, flux);
    for(let x=0; x<w; x++){
      const t = (x / w) * Math.PI * 2 * freq + scopeState.t * 0.05 + phase * 6.28;
      const y = h/2 + Math.sin(t) * amp + (Math.sin(t*2.71+2) * 4) + noise1D(x*0.05, scopeState.t*0.02)*3;
      if (x===0) sctx.moveTo(x,y); else sctx.lineTo(x,y);
    }
    sctx.stroke();
    for (let i = scopeState.pulses.length -1; i >= 0; i--) {
      const p = scopeState.pulses[i];
      p.life -= 0.02;
      if (p.life <= 0) { scopeState.pulses.splice(i,1); continue; }
      sctx.globalAlpha = p.life;
      sctx.fillStyle = 'rgba(255,255,255,.6)';
      sctx.fillRect(p.x, 0, 2, h);
    }
    scopeState.t += 1;
    requestAnimationFrame(scopeDraw);
  }
  function scopePulse() {
    const w = scope.width;
    scopeState.pulses.push({ x: Math.floor(rand(0, w)), life: 0.8 });
  }
  function noise1D(x, t) { return Math.sin(x*1.3 + t) + Math.sin(x*0.7 - t*0.7) * 0.5; }

  const neb = $('#nebula');
  const nctx = neb.getContext('2d');
  const nebula = {
    pts: [], time: 0,
    init() {
      const w = neb.width, h = neb.height;
      this.pts = Array.from({length: 220}, () => ({
        x: rand(0,w), y: rand(0,h),
        vx: rand(-0.3,0.3), vy: rand(-0.3,0.3),
        hue: Math.floor(rand(0,360))
      }));
    },
    draw(level=0.5) {
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
  let nebulaLevel = 0.2;
  nebula.init();

  let audio;
  let nodes = {};
  function audioCtx(){
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      const master = audio.createGain(); master.gain.value = 0.6; master.connect(audio.destination);
      const analyser = audio.createAnalyser(); analyser.fftSize = 1024; analyser.connect(master);
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
      const ac = audioCtx(); const n = nodes;
      const o = ac.createOscillator();
      o.type = opts.type || 'sine';
      o.frequency.setValueAtTime(freq, ac.currentTime);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, ac.currentTime);
      const peak = 0.07 + (opts.vel || 0)*0.1;
      g.gain.linearRampToValueAtTime(peak, ac.currentTime + (env.a ?? .01));
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + (env.a ?? .01) + (env.d ?? .08) + (env.r ?? .18));
      o.connect(g);
      g.connect(nodes.dry);
      g.connect(nodes.shaper);
      o.start();
      o.stop(ac.currentTime + 0.8);
      scopePulse();
    } catch(e) {}
  }
  function blip(freq=440, attack=0.01, release=0.05){
    playTone(freq, {a:attack, d:0.02, r:release}, {type: Math.random()<0.5?'triangle':'sine', vel:0.3});
  }
  function vibrate(pattern){ if (navigator.vibrate) navigator.vibrate(pattern); }

  const fx = {
    cutoff: $('#fx-cutoff'), q: $('#fx-q'), delay: $('#fx-delay'), feedback: $('#fx-feedback'),
    reverb: $('#fx-reverb'), dist: $('#fx-dist'), mix: $('#fx-mix')
  };
  const bindFX = () => {
    const ac = audioCtx(); const n = nodes;
    const apply = () => {
      n.filter.frequency.setTargetAtTime(Number(fx.cutoff.value), ac.currentTime, 0.02);
      n.filter.Q.setTargetAtTime(Number(fx.q.value), ac.currentTime, 0.02);
      n.delay.delayTime.setTargetAtTime(Number(fx.delay.value), ac.currentTime, 0.02);
      n.feedback.gain.setTargetAtTime(Number(fx.feedback.value), ac.currentTime, 0.02);
      n.reverbWet.gain.setTargetAtTime(Number(fx.reverb.value), ac.currentTime, 0.02);
      n.wet.gain.setTargetAtTime(Number(fx.mix.value), ac.currentTime, 0.02);
      n.shaper.curve = makeDistCurve(Number(fx.dist.value));
    };
    Object.values(fx).forEach(inp => inp.addEventListener('input', apply));
    apply();
  };

  const lfo = {
    rate: $('#lfo-rate'),
    depth: $('#lfo-depth'),
    toCutoff: $('#lfo-cutoff'),
    toGain: $('#lfo-gain'),
    toDelay: $('#lfo-delay'),
    phase: 0
  };
  function lfoTick(dt){
    const ac = audioCtx(); const n = nodes;
    const rate = Number(lfo.rate.value);
    const depth = Number(lfo.depth.value);
    lfo.phase += dt * rate * 0.006;
    const v = Math.sin(lfo.phase * Math.PI * 2) * depth;
    if (lfo.toCutoff.checked) {
      const base = Number(fx.cutoff.value);
      n.filter.frequency.setTargetAtTime(clamp(base * (1 + v*0.6), 100, 10000), ac.currentTime, 0.02);
    }
    if (lfo.toDelay.checked) {
      const base = Number(fx.delay.value);
      n.delay.delayTime.setTargetAtTime(clamp(base + v*0.12, 0, 0.9), ac.currentTime, 0.02);
    }
    if (lfo.toGain.checked) {
      const base = nodes.master.gain.value;
      nodes.master.gain.setTargetAtTime(clamp(base * (1 + v*0.5), 0.1, 1.0), ac.currentTime, 0.03);
    }
  }

  const dronePad = $('#drone-pad');
  const droneCursor = $('#drone-pad .cursor');
  const droneHold = $('#drone-hold');
  const droneWave = $('#drone-wave');
  const droneVol = $('#drone-vol');
  let drone = { o: null, g: null };
  const droneBounds = () => dronePad.getBoundingClientRect();

  function startDrone(x, y){
    const ac = audioCtx(); const n = nodes;
    if (drone.o) stopDrone();
    drone.o = ac.createOscillator();
    drone.o.type = droneWave.value;
    drone.g = ac.createGain();
    drone.g.gain.value = Number(droneVol.value)/100 * 0.3;
    drone.o.connect(drone.g);
    drone.g.connect(nodes.dry);
    drone.g.connect(nodes.shaper);
    drone.o.start();
    moveDrone(x, y);
  }
  function moveDrone(x, y){
    if (!drone.o) return;
    const b = droneBounds();
    const nx = clamp((x - b.left) / b.width, 0, 1);
    const ny = clamp((y - b.top) / b.height, 0, 1);
    const ac = audioCtx();
    const freq = lerp(110, 1200, nx*nx);
    const cutoff = lerp(400, 7000, 1-ny);
    drone.o.frequency.setTargetAtTime(freq, ac.currentTime, 0.01);
    nodes.filter.frequency.setTargetAtTime(cutoff, ac.currentTime, 0.05);
    droneCursor.style.left = `${nx*100}%`; droneCursor.style.top = `${ny*100}%`;
    scopePulse();
  }
  function stopDrone(){
    if (!drone.o) return;
    try { drone.o.stop(); } catch(e){}
    drone.o.disconnect(); drone.g.disconnect();
    drone = { o:null, g:null };
  }
  dronePad.addEventListener('pointerdown', e => {
    dronePad.setPointerCapture(e.pointerId);
    startDrone(e.clientX, e.clientY);
  });
  dronePad.addEventListener('pointermove', e => {
    if (drone.o) moveDrone(e.clientX, e.clientY);
  });
  dronePad.addEventListener('pointerup', e => {
    if (!droneHold.checked) stopDrone();
    dronePad.releasePointerCapture(e.pointerId);
  });
  droneWave.addEventListener('change', () => { if (drone.o) drone.o.type = droneWave.value; });
  droneVol.addEventListener('input', () => { if (drone.g) drone.g.gain.value = Number(droneVol.value)/100 * 0.3; });

  $$('.tone').forEach(btn => {
    btn.addEventListener('click', () => {
      const mul = Number(btn.dataset.mul);
      const base = 220 * Math.pow(2, Math.floor(rand(0,2)));
      const f = base * mul;
      playTone(f, {a:.01,d:.08,r:.4}, {type:'sine', vel:.5});
      playTone(f*2.01, {a:.02,d:.12,r:.5}, {type:'triangle', vel:.3});
    });
  });

  const pad = $('.keypad .pad');
  const glyphs = [];
  for(let i=0; i<12; i++){
    const b = document.createElement('button');
    b.className = 'glyph';
    const svg = alienGlyphSVG();
    svg.classList.add('glyph__icon');
    b.appendChild(svg);
    b.addEventListener('click', () => {
      b.classList.add('playing');
      const f = lerp(220, 1400, i/12);
      playTone(f, {a:.02,d:.05,r:.18}, {type: Math.random()<0.5?'sine':'triangle', vel:.4});
      setTimeout(() => b.classList.remove('playing'), 160);
    });
    pad.appendChild(b);
    glyphs.push(b);
  }

  const crt = $('.terminal .crt');
  function line(str) {
    const el = document.createElement('div');
    el.className = 'line';
    el.innerHTML = str;
    crt.appendChild(el);
    crt.scrollTop = crt.scrollHeight;
  }
  const tags = ['COIL', 'NAV', 'ION', 'RNG', 'WORM', 'CLS', 'SHD', 'GTE', 'ANC'];
  function randomStatus() {
    const tag = tags[Math.floor(Math.random()*tags.length)];
    const v = (Math.random() < 0.5) ? `${(rand(0,100)).toFixed(2)}%` : `${(rand(100,999)).toFixed(0)}.${(rand(0,99)|0)}`;
    const status = Math.random() < 0.5 ? 'STABLE' : (Math.random()<0.5 ? 'FLUX' : 'PHASE');
    line(`<span class="tag">[${tag}]</span> <span class="val">${v}</span> :: ${status}`);
  }
  setInterval(randomStatus, 1400);
  randomStatus();

  function stepMatrix(dt){
    if (!playing) return;
    stepTimer += dt;
    const bpm = Number(tempo.value);
    const beatMs = 60000 / bpm;
    const swingAmt = Number(swing.value) / 100;
    const even = step % 2 === 1;
    const currentBeat = beatMs * (even ? (1 + swingAmt*0.4) : (1 - swingAmt*0.4));
    if (stepTimer >= currentBeat) {
      cells.filter(c => Number(c.dataset.c) === step).forEach(c => c.classList.remove('step'));
      stepTimer = 0;
      step = (step + 1) % cols;
      const on = cells.filter(c => Number(c.dataset.c) === step && c.classList.contains('active'));
      cells.filter(c => Number(c.dataset.c) === step).forEach(c => c.classList.add('step'));
      on.forEach(c => playTone(noteFor(Number(c.dataset.r)), {a:.005,d:.02,r:.08}, {type:'square', vel:.5}));
      if (on.length) scopePulse();
    }
  }

  let last = performance.now();
  function tick(now) {
    const dt = now - last; last = now;
    stepMatrix(dt);
    lfoTick(dt);
    analyserTap();
    requestAnimationFrame(tick);
  }
  scopeDraw();
  nebula.draw();
  requestAnimationFrame(tick);

  let anaBuf = new Uint8Array(512);
  function analyserTap(){
    if (!audio) return;
    nodes.analyser.getByteFrequencyData(anaBuf);
    let sum = 0; for (let i=0; i<anaBuf.length; i++) sum += anaBuf[i];
    nebulaLevel = sum / (anaBuf.length * 255);
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

  function randomizeAll(){
    toggles.forEach(t => { t.checked = Math.random() < 0.6; t.dispatchEvent(new Event('change'));});
    $$('.vslider input').forEach(sl => { sl.value = Math.floor(rand(10,90)); sl.dispatchEvent(new Event('input')); });
    knobElems.forEach(kn => setKnobAngle(kn, Math.random()));
    cells.forEach(c => {
      const active = Math.random() < 0.25;
      c.classList.toggle('active', active);
      c.setAttribute('aria-pressed', String(active));
    });
    $('#fx-cutoff').value = Math.floor(lerp(200, 7000, Math.random()));
    $('#fx-q').value = (Math.random()*10+0.5).toFixed(1);
    $('#fx-delay').value = Math.random().toFixed(2);
    $('#fx-feedback').value = Math.random().toFixed(2);
    $('#fx-reverb').value = Math.random().toFixed(2);
    $('#fx-dist').value = Math.floor(Math.random()*80);
    $('#fx-mix').value = Math.random().toFixed(2);
    bindFX();
    $('#lfo-rate').value = (Math.random()*6+0.2).toFixed(1);
    $('#lfo-depth').value = Math.random().toFixed(2);
    $('#lfo-cutoff').checked = Math.random() < 0.8;
    $('#lfo-gain').checked = Math.random() < 0.4;
    $('#lfo-delay').checked = Math.random() < 0.5;
    worm.value = Math.floor(Math.random()*100); updateWorm();
    scopePulse();
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); randomizeAll(); }
    if (e.key === '?') { e.preventDefault(); help.open ? help.close() : help.showModal(); }
  });

  ['click','keydown','pointerdown','touchstart'].forEach(ev => {
    window.addEventListener(ev, function once() {
      audioCtx(); bindFX();
      window.removeEventListener(ev, once, true);
    }, true);
  });

})();