(function(){
  "use strict";

  // ---------------- config ----------------
  const COLS = 2, ROWS = 2;
  // 1920x1080 (16:9) landscape ratio, scaled to fit the mobile stage
  const SW = 190;        // core piece width (px)
  const SH = 107;        // core piece height (px)
  const PAD = Math.ceil(Math.max(SW, SH) * 0.34) + 8; 
  const PIECE_W = SW + PAD*2;
  const PIECE_H = SH + PAD*2;
  const BOARD_W = SW*COLS, BOARD_H = SH*ROWS;
  const SNAP_DIST = 30;

  const stage = document.getElementById('stage');
  const board = document.getElementById('board');
  const ghost = document.getElementById('ghost');
  const gridSvg = document.getElementById('grid-overlay');
  const caption = document.getElementById('caption');
  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');
  const puzzleScreen = document.getElementById('puzzle-screen');
  const loadingScreen = document.getElementById('loading-screen');
  const flashStrobe = document.getElementById('flash-strobe');
  const revealScreen = document.getElementById('reveal-screen');
  const revealImg = document.getElementById('reveal-img');
  const revealHint = document.getElementById('reveal-hint');

  board.style.width = BOARD_W+'px';
  board.style.height = BOARD_H+'px';
  ghost.style.width = BOARD_W+'px';
  ghost.style.height = BOARD_H+'px';
  gridSvg.setAttribute('width', BOARD_W);
  gridSvg.setAttribute('height', BOARD_H);

  // ---------------- generate scene image ----------------
  function generateSceneDataURL(w, h){
    const scale = 2; 
    const c = document.createElement('canvas');
    c.width = w*scale; c.height = h*scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);

    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#0d1230');
    g.addColorStop(.55,'#151a45');
    g.addColorStop(1,'#080a1c');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    const neb = ctx.createRadialGradient(w*0.7,h*0.25,10,w*0.7,h*0.25,w*0.6);
    neb.addColorStop(0,'rgba(200,107,122,0.14)');
    neb.addColorStop(1,'rgba(200,107,122,0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0,0,w,h);

    const mx = w*0.78, my = h*0.22, mr = w*0.10;
    ctx.save();
    ctx.shadowColor = 'rgba(231,183,80,0.65)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#f2d48a';
    ctx.beginPath(); ctx.arc(mx,my,mr,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(180,150,90,0.25)';
    [[-0.35,-0.1,0.28],[0.15,0.3,0.4],[0.3,-0.35,0.22]].forEach(function(cr){
      ctx.beginPath(); ctx.arc(mx+cr[0]*mr, my+cr[1]*mr, cr[2]*mr, 0, Math.PI*2); ctx.fill();
    });

    for(let i=0;i<130;i++){
      const x = Math.random()*w, y = Math.random()*h*0.9;
      const r = Math.random()*1.4+0.3;
      const o = Math.random()*0.6+0.3;
      ctx.fillStyle = 'rgba(243,235,216,'+o+')';
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }

    const constel = [
      [0.15,0.62],[0.24,0.48],[0.34,0.52],[0.30,0.68],
      [0.42,0.40],[0.50,0.55],[0.44,0.72],[0.58,0.30],[0.20,0.32]
    ].map(p=>[p[0]*w, p[1]*h]);
    const edges = [[0,1],[1,2],[2,3],[3,0],[1,4],[4,5],[5,6],[6,3],[4,7],[1,8]];
    ctx.strokeStyle = 'rgba(231,183,80,0.45)';
    ctx.lineWidth = 1;
    edges.forEach(function(e){
      ctx.beginPath();
      ctx.moveTo(constel[e[0]][0], constel[e[0]][1]);
      ctx.lineTo(constel[e[1]][0], constel[e[1]][1]);
      ctx.stroke();
    });
    constel.forEach(function(p){
      ctx.save();
      ctx.shadowColor = 'rgba(231,183,80,0.9)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#f2d48a';
      ctx.beginPath(); ctx.arc(p[0],p[1],1.8,0,Math.PI*2); ctx.fill();
      ctx.restore();
    });

    ctx.save();
    ctx.translate(w*0.08, h*0.15);
    ctx.rotate(0.5);
    const cg = ctx.createLinearGradient(0,0,90,0);
    cg.addColorStop(0,'rgba(243,235,216,0)');
    cg.addColorStop(1,'rgba(243,235,216,0.55)');
    ctx.strokeStyle = cg;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(90,0); ctx.stroke();
    ctx.restore();

    return c.toDataURL('image/png');
  }

  const IMAGE_SRC = 'https://upload.wikimedia.org/wikipedia/commons/6/66/Flag_of_Malaysia.svg';
  const REVEAL_IMAGE_SRC = 'Poster.jpeg';

  const SNAP_SOUND_SRC = 'puzzlefinal.mp3';
  const LOADING_SOUND_SRC = 'merdekashort.mp3';
  const COMPLETE_SOUND_SRC = 'bungapi.mp3';
  const REVEAL_SONG_SRC = 'lagufinal.mp3'; 

  let audioCtx = null;
  function getAudioCtx(){
    if(!audioCtx){
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return null;
      audioCtx = new Ctx();
    }
    if(audioCtx.state === 'suspended'){ audioCtx.resume(); }
    return audioCtx;
  }
  
  stage.addEventListener('pointerdown', getAudioCtx, { once:true });

  function playFile(src, label){
    const audio = new Audio(src);
    audio.play().catch(function(err){ console.warn('Could not play '+label+':', err); });
  }

  function playSnapSound(){
    if(SNAP_SOUND_SRC){ playFile(SNAP_SOUND_SRC, 'SNAP_SOUND_SRC'); return; }
    const ctx = getAudioCtx();
    if(!ctx) return;
    try{
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.exponentialRampToValueAtTime(1320, t0+0.06);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.18, t0+0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0+0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0+0.16);
    }catch(err){ console.warn('Web Audio unavailable for snap sound:', err); }
  }

  function playLoadingSound(){
    if(LOADING_SOUND_SRC){ playFile(LOADING_SOUND_SRC, 'LOADING_SOUND_SRC'); return; }
    const ctx = getAudioCtx();
    if(!ctx) return;
    try{
      const t0 = ctx.currentTime;
      const dur = 1.7;

      const bufSize = ctx.sampleRate * dur;
      const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for(let i=0;i<bufSize;i++){ data[i] = Math.random()*2-1; }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(0.9, t0);
      filter.frequency.setValueAtTime(200, t0);
      filter.frequency.exponentialRampToValueAtTime(4200, t0+dur*0.7);
      filter.frequency.exponentialRampToValueAtTime(600, t0+dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.35, t0+dur*0.55);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0+dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(t0);
      noise.stop(t0+dur);

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(60, t0);
      osc.frequency.exponentialRampToValueAtTime(180, t0+dur*0.8);
      oscGain.gain.setValueAtTime(0.0001, t0);
      oscGain.gain.exponentialRampToValueAtTime(0.12, t0+dur*0.5);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0+dur);
    }catch(err){ console.warn('Web Audio unavailable for loading sound:', err); }
  }

  function playCompletionSound(){
    if(COMPLETE_SOUND_SRC){ playFile(COMPLETE_SOUND_SRC, 'COMPLETE_SOUND_SRC'); return; }
    const ctx = getAudioCtx();
    if(!ctx) return;
    try{
      const notes = [523.25, 659.25, 783.99, 1046.50]; 
      notes.forEach(function(freq, i){
        const t0 = ctx.currentTime + i*0.11;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.22, t0+0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0+0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0+0.55);
      });
    }catch(err){
      console.warn('Web Audio unavailable, no completion sound played:', err);
    }
  }

  function loadCustomImage(src, w, h){
    return new Promise(function(resolve, reject){
      if(!src){ reject(new Error('no IMAGE_SRC set')); return; }
      const img = new Image();
      img.crossOrigin = 'anonymous'; 
      img.onload = function(){
        try{
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          const scale = Math.max(w/img.naturalWidth, h/img.naturalHeight);
          const dw = img.naturalWidth*scale, dh = img.naturalHeight*scale;
          const dx = (w-dw)/2, dy = (h-dh)/2;
          ctx.drawImage(img, dx, dy, dw, dh);
          resolve(c.toDataURL('image/png'));
        }catch(err){
          reject(err); 
        }
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  let sceneURL = null;

  loadCustomImage(IMAGE_SRC, BOARD_W, BOARD_H)
    .catch(function(err){
      if(IMAGE_SRC) console.warn('Could not load IMAGE_SRC, falling back to generated art:', err);
      return generateSceneDataURL(BOARD_W, BOARD_H);
    })
    .then(function(url){
      sceneURL = url;
      ghost.src = sceneURL;
      buildPieces();
    });

  (function drawGrid(){
    let s = '';
    for(let i=1;i<COLS;i++){
      s += '<line x1="'+(i*SW)+'" y1="0" x2="'+(i*SW)+'" y2="'+BOARD_H+'" stroke="rgba(231,183,80,0.10)" stroke-dasharray="3,4"/>';
    }
    for(let j=1;j<ROWS;j++){
      s += '<line x1="0" y1="'+(j*SH)+'" x2="'+BOARD_W+'" y2="'+(j*SH)+'" stroke="rgba(231,183,80,0.10)" stroke-dasharray="3,4"/>';
    }
    gridSvg.innerHTML = s;
  })();

  function rot(x,y,deg){
    const r = deg*Math.PI/180;
    return [ x*Math.cos(r)-y*Math.sin(r), x*Math.sin(r)+y*Math.cos(r) ];
  }
  function toGlobal(origin, deg, x, y){
    const p = rot(x,y,deg);
    return [ origin[0]+p[0], origin[1]+p[1] ];
  }
  function edgeCommands(origin, deg, L, sign){
    if(sign === 0){
      const e = toGlobal(origin, deg, L, 0);
      return 'L '+e[0].toFixed(2)+','+e[1].toFixed(2)+' ';
    }
    const neckX = 0.28;             
    const amp = sign > 0 ? 0.345 : 0.30; 
    const head = -sign * L * amp;   
    const x0 = neckX*L, x1 = 0.5*L, x2 = (1-neckX)*L;
    const k = 0.55 * (x1-x0);       

    const cmds = [
      ['L', [x0,0]],
      ['C', [x0+k,0], [x1-k,head], [x1,head]],
      ['C', [x1+k,head], [x2-k,0], [x2,0]],
      ['L', [L,0]]
    ];

    let out = '';
    cmds.forEach(function(cmd){
      if(cmd[0]==='L'){
        const p = toGlobal(origin,deg,cmd[1][0],cmd[1][1]);
        out += 'L '+p[0].toFixed(2)+','+p[1].toFixed(2)+' ';
      }else{
        const p1 = toGlobal(origin,deg,cmd[1][0],cmd[1][1]);
        const p2 = toGlobal(origin,deg,cmd[2][0],cmd[2][1]);
        const p3 = toGlobal(origin,deg,cmd[3][0],cmd[3][1]);
        out += 'C '+p1[0].toFixed(2)+','+p1[1].toFixed(2)+' '+
                     p2[0].toFixed(2)+','+p2[1].toFixed(2)+' '+
                     p3[0].toFixed(2)+','+p3[1].toFixed(2)+' ';
      }
    });
    return out;
  }
  function piecePath(topSign, rightSign, bottomSign, leftSign){
    const TL=[PAD,PAD], TR=[PAD+SW,PAD], BR=[PAD+SW,PAD+SH], BL=[PAD,PAD+SH];
    let d = 'M '+TL[0]+','+TL[1]+' ';
    d += edgeCommands(TL, 0, SW, topSign);
    d += edgeCommands(TR, 90, SH, rightSign);
    d += edgeCommands(BR, 180, SW, bottomSign);
    d += edgeCommands(BL, 270, SH, leftSign);
    d += 'Z';
    return d;
  }

  const H = []; 
  for(let r=0;r<ROWS;r++){ H.push([]); for(let c=0;c<COLS-1;c++){ H[r].push(Math.random()<0.5?1:-1); } }
  const V = []; 
  for(let r=0;r<ROWS-1;r++){ V.push([]); for(let c=0;c<COLS;c++){ V[r].push(Math.random()<0.5?1:-1); } }

  function signFor(r,c,side){
    if(side==='top'){ return r===0 ? 0 : -V[r-1][c]; }
    if(side==='bottom'){ return r===ROWS-1 ? 0 : V[r][c]; }
    if(side==='left'){ return c===0 ? 0 : -H[r][c-1]; }
    if(side==='right'){ return c===COLS-1 ? 0 : H[r][c]; }
  }

  const pieces = [];
  let placedCount = 0;
  let zTop = 10;

  const stageWidth = Math.min(stage.clientWidth || 380, 420);
  const boardLeft = (stageWidth - BOARD_W)/2;
  const boardTop = 0;
  board.style.left = boardLeft+'px';

  const trayTop = BOARD_H + 46;
  const gap = 10;
  const perRow = Math.max(2, Math.floor((stageWidth) / (PIECE_W+gap)));
  const trayRows = Math.ceil((COLS*ROWS)/perRow);
  stage.style.height = (trayTop + trayRows*(PIECE_H+gap) + 20) + 'px';

  const order = [];
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) order.push([r,c]);
  for(let i=order.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=order[i]; order[i]=order[j]; order[j]=t; }

  const clipDefsSvg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  clipDefsSvg.setAttribute('width','0');
  clipDefsSvg.setAttribute('height','0');
  clipDefsSvg.style.position = 'absolute';
  const clipDefs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  clipDefsSvg.appendChild(clipDefs);
  stage.appendChild(clipDefsSvg);

  function buildPieces(){
    order.forEach(function(rc, idx){
      const r = rc[0], c = rc[1];
      const el = document.createElement('div');
      el.className = 'piece';
      el.style.width = PIECE_W+'px';
      el.style.height = PIECE_H+'px';

      const art = document.createElement('div');
      art.className = 'piece-art';
      art.style.backgroundImage = 'url('+sceneURL+')';
      art.style.backgroundSize = BOARD_W+'px '+BOARD_H+'px';
      art.style.backgroundPosition = (-(c*SW-PAD))+'px '+(-(r*SH-PAD))+'px';

      const d = piecePath(
        signFor(r,c,'top'), signFor(r,c,'right'),
        signFor(r,c,'bottom'), signFor(r,c,'left')
      );
      const clipId = 'piece-clip-'+r+'-'+c;
      const clipPathEl = document.createElementNS('http://www.w3.org/2000/svg','clipPath');
      clipPathEl.setAttribute('id', clipId);
      clipPathEl.setAttribute('clipPathUnits', 'userSpaceOnUse');
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg','path');
      pathEl.setAttribute('d', d);
      clipPathEl.appendChild(pathEl);
      clipDefs.appendChild(clipPathEl);
      art.style.clipPath = "url(#"+clipId+")";
      art.style.webkitClipPath = "url(#"+clipId+")";
      el.appendChild(art);

      const targetX = boardLeft + c*SW - PAD;
      const targetY = boardTop + r*SH - PAD;

      const row = Math.floor(idx/perRow), col = idx%perRow;
      const trayRowWidth = Math.min(perRow, (COLS*ROWS)-row*perRow) * (PIECE_W+gap) - gap;
      const trayLeft = (stageWidth-trayRowWidth)/2 + col*(PIECE_W+gap);
      const trayY = trayTop + row*(PIECE_H+gap);
      const jitter = 6;
      const startX = trayLeft + (Math.random()*jitter*2-jitter);
      const startY = trayY + (Math.random()*jitter*2-jitter);

      el.style.left = startX+'px';
      el.style.top = startY+'px';
      el.dataset.targetX = targetX;
      el.dataset.targetY = targetY;
      el.style.zIndex = zTop++;

      stage.appendChild(el);
      pieces.push(el);
      attachDrag(el);
    });
  }

  function attachDrag(el){
    let dragging = false, offX=0, offY=0;
    el.addEventListener('pointerdown', function(e){
      if(el.classList.contains('placed')) return;
      dragging = true;
      try{ el.setPointerCapture(e.pointerId); }catch(err){}
      const rect = stage.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      offX = px - parseFloat(el.style.left);
      offY = py - parseFloat(el.style.top);
      el.style.zIndex = zTop++;
      el.style.cursor = 'grabbing';
      e.preventDefault();
    });
    el.addEventListener('pointermove', function(e){
      if(!dragging) return;
      const rect = stage.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      el.style.left = (px-offX)+'px';
      el.style.top = (py-offY)+'px';
      e.preventDefault();
    });
    function drop(e){
      if(!dragging) return;
      dragging = false;
      el.style.cursor = 'grab';
      const tx = parseFloat(el.dataset.targetX), ty = parseFloat(el.dataset.targetY);
      const cx = parseFloat(el.style.left), cy = parseFloat(el.style.top);
      const dist = Math.hypot(tx-cx, ty-cy);
      if(dist < SNAP_DIST){
        el.style.left = tx+'px';
        el.style.top = ty+'px';
        el.classList.add('placed');
        el.style.zIndex = 5;
        placedCount++;
        updateProgress();
        triggerSnapEffect(el, tx, ty);
        if(placedCount === pieces.length){ setTimeout(celebrate, 200); }
      }
    }
    el.addEventListener('pointerup', drop);
    el.addEventListener('pointercancel', drop);
  }

  function triggerSnapEffect(el, tx, ty){
    el.classList.add('snap-in');
    playSnapSound();
    setTimeout(function(){ el.classList.remove('snap-in'); }, 460);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cx = tx + PIECE_W/2, cy = ty + PIECE_H/2;

    const flash = document.createElement('div');
    flash.className = 'snap-flash';
    const fSize = Math.min(SW,SH)*1.3;
    flash.style.width = fSize+'px';
    flash.style.height = fSize+'px';
    flash.style.left = cx+'px';
    flash.style.top = cy+'px';
    stage.appendChild(flash);
    setTimeout(function(){ flash.remove(); }, 520);

    if(!reduce){
      const ring = document.createElement('div');
      ring.className = 'snap-ring';
      const rSize = Math.min(SW,SH)*0.9;
      ring.style.width = rSize+'px';
      ring.style.height = rSize+'px';
      ring.style.left = cx+'px';
      ring.style.top = cy+'px';
      stage.appendChild(ring);
      setTimeout(function(){ ring.remove(); }, 550);
    }
  }

  function updateProgress(){
    placedCount = stage.querySelectorAll('.piece.placed').length;
    progressText.textContent = placedCount+' / '+pieces.length;
    progressFill.style.width = (placedCount/pieces.length*100)+'%';
  }

  const progressObserver = new MutationObserver(function(){ updateProgress(); });
  progressObserver.observe(stage, { attributes:true, attributeFilter:['class'], subtree:true });

  function celebrate(){
    board.classList.add('complete');
    ghost.classList.add('revealed');
    caption.classList.add('show');
    playCompletionSound();

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!reduce){
      const cx = boardLeft + BOARD_W/2, cy = boardTop + BOARD_H/2;
      const rayCount = 26;
      for(let i=0;i<rayCount;i++){
        const ray = document.createElement('div');
        ray.className = 'ray';
        ray.style.left = cx+'px';
        ray.style.top = cy+'px';
        ray.style.transform = 'rotate('+(i*(360/rayCount))+'deg)';
        stage.appendChild(ray);
        (function(r){ setTimeout(function(){ r.classList.add('go'); }, i*12); })(ray);
        setTimeout(function(){ ray.remove(); }, 1600+ i*12);
      }
    }

    setTimeout(function(){ startLoadingSequence(reduce); }, reduce ? 400 : 2100);
  }

  function startLoadingSequence(reduce){
    puzzleScreen.classList.add('fade-out');

    setTimeout(function(){
      loadingScreen.classList.add('show');
      window.scrollTo({top:0, behavior:'instant'});
      puzzleScreen.style.display = 'none';
      playLoadingSound();

      if(!reduce){
        document.body.classList.add('shake');
        flashStrobe.classList.add('go');
        setTimeout(function(){
          document.body.classList.remove('shake');
          flashStrobe.classList.remove('go');
        }, 520);
      }

      const loadDuration = reduce ? 700 : 2000;
      setTimeout(showReveal, loadDuration);
    }, 650);
  }

  function showReveal(){
    loadingScreen.classList.remove('show');
    revealImg.src = REVEAL_IMAGE_SRC || sceneURL;
    revealScreen.classList.add('fade-in');
    setTimeout(function(){ revealImg.classList.add('show'); }, 80);
    setTimeout(function(){ revealHint.classList.add('show'); }, 1500);

    if(REVEAL_SONG_SRC){
      playFile(REVEAL_SONG_SRC, 'REVEAL_SONG_SRC');
    }
  }

  revealScreen.addEventListener('click', function(){
    location.reload();
  });

})();
