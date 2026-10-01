(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const intro = document.getElementById('intro');
  const startBtn = document.getElementById('startBtn');
  const hud = document.getElementById('hud');
  const cameraWrap = document.getElementById('cameraWrap');
  const cameraEl = document.getElementById('camera');
  const poseOverlay = document.getElementById('poseOverlay');
  const octx = poseOverlay.getContext('2d');
  const cameraBtn = document.getElementById('cameraBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const restartBtn = document.getElementById('restartBtn');
  const soundBtn = document.getElementById('soundBtn');
  const scoreValue = document.getElementById('scoreValue');
  const highScoreEl = document.getElementById('highScore');
  const livesEl = document.getElementById('lives');
  const comboValue = document.getElementById('comboValue');
  const shieldFill = document.getElementById('shieldFill');
  const statusText = document.getElementById('statusText');
  const countdown = document.getElementById('countdown');
  const message = document.getElementById('message');
  const shieldCallout = document.getElementById('shieldCallout');
  const gameover = document.getElementById('gameover');
  const finalScore = document.getElementById('finalScore');
  const bestCombo = document.getElementById('bestCombo');
  const dodgedCount = document.getElementById('dodgedCount');
  const modeResult = document.getElementById('modeResult');
  const newBest = document.getElementById('newBest');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const difficultyEl = document.getElementById('difficulty');
  const gameoverDifficultyEl = document.getElementById('gameoverDifficulty');

  let W = innerWidth, H = innerHeight, DPR = Math.min(devicePixelRatio || 1, 1.6);
  let pose, camera, running = false, started = false, over = false, cameraVisible = false;
  let score = 0, lives = 3, combo = 1, maxCombo = 1, dodged = 0, shield = 100;
  let obstacles = [], sparks = [], stars = [], debris = [], spawnTimer = 0, difficulty = 1, last = performance.now();
  let mouseFallback = true, playerSeen = false, soundOn = true, audioCtx = null;
  let gameMode = 'normal';
  let highScore = Number(localStorage.getItem('astroDodgeHighScore') || 0);
  let lastHandsUp = false;

  const modes = {
    easy: { speed: .82, spawn: 1.18, score: .85, label: 'EASY' },
    normal: { speed: 1, spawn: 1, score: 1, label: 'NORMAL' },
    chaos: { speed: 1.24, spawn: .78, score: 1.35, label: 'CHAOS' }
  };

  const player = { x: W/2, targetX: W/2, y: H*.82, r: 27, shield:false, handsUp:false, tilt:0, jet:0 };

  function beep(freq=440, duration=.08, type='sine', gain=.035){
    if(!soundOn) return;
    try{
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.value = gain;
      osc.connect(g); g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(gain, now);
      g.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.start(now); osc.stop(now + duration);
    }catch(_){ }
  }

  function resize(){
    W=innerWidth; H=innerHeight; DPR=Math.min(devicePixelRatio||1,1.6);
    canvas.width=Math.floor(W*DPR); canvas.height=Math.floor(H*DPR); canvas.style.width=W+'px'; canvas.style.height=H+'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
    poseOverlay.width=Math.max(1,Math.floor(cameraWrap.clientWidth*DPR)); poseOverlay.height=Math.max(1,Math.floor(cameraWrap.clientHeight*DPR)); octx.setTransform(DPR,0,0,DPR,0,0);
    player.y=H*.82;
    stars=Array.from({length:200},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.4+.2,a:Math.random()*.7+.15,s:Math.random()*.35+.08}));
  }

  function resetGame(){
    score=0;lives=3;combo=1;maxCombo=1;dodged=0;shield=100;difficulty=1;spawnTimer=0;obstacles=[];sparks=[];debris=[];over=false;started=false;lastHandsUp=false;
    updateHud(); gameover.classList.add('hidden'); newBest.classList.add('hidden');
  }

  function updateHud(){
    scoreValue.textContent=String(Math.floor(score)).padStart(6,'0');
    highScoreEl.textContent=String(highScore).padStart(6,'0');
    comboValue.textContent='x'+combo;
    livesEl.textContent='❤ '.repeat(lives).trim();
    shieldFill.style.width=Math.max(0,shield)+'%';
  }

  function spawnObstacle(){
    const roll=Math.random();
    let type='meteor';
    if(score>400 && roll>.82) type='ufo';
    if(score>900 && roll>.94) type='laser';

    if(type==='laser'){
      const x=70+Math.random()*(W-140);
      obstacles.push({type,x,y:-100,w:18,h:170,vy:(4.1+difficulty*.32)*(H/900)*modes[gameMode].speed,alpha:1,dead:false,near:false});
      return;
    }

    const size=type==='ufo'?26+Math.random()*10:18+Math.random()*28;
    const speed=(2.8+Math.random()*2.1+difficulty*.28)*(H/900)*modes[gameMode].speed;
    obstacles.push({type,x:50+Math.random()*(W-100),y:-60,r:size,vy:speed,rot:Math.random()*6.28,vr:(Math.random()-.5)*.06,near:false,dead:false,phase:Math.random()*6.28});
  }

  function burst(x,y,color='84,230,255',n=20,power=5){
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2,s=Math.random()*power+1;
      sparks.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,color,size:1+Math.random()*2.5});
    }
  }

  function hit(o){
    if(player.shield && shield>0){
      shield=Math.max(0,shield-26); burst(o.x,o.y,'103,255,195',32,6); score+=45*combo; combo=Math.min(9,combo+1); maxCombo=Math.max(maxCombo,combo); flashMessage('SHIELD BLOCK!'); beep(720,.09,'triangle',.05); return;
    }
    lives--; combo=1; burst(o.x,o.y,'255,88,185',42,7); flashMessage('HIT!'); beep(125,.18,'sawtooth',.06);
    if(lives<=0) endGame();
  }

  function flashMessage(txt){
    message.textContent=txt; message.classList.remove('hidden'); clearTimeout(flashMessage.t); flashMessage.t=setTimeout(()=>message.classList.add('hidden'),650);
  }

  function endGame(){
    over=true; started=false; const final=Math.floor(score); finalScore.textContent=final; bestCombo.textContent='x'+maxCombo; dodgedCount.textContent=dodged; modeResult.textContent=modes[gameMode].label;
    if(final>highScore){ highScore=final; localStorage.setItem('astroDodgeHighScore',String(highScore)); newBest.classList.remove('hidden'); beep(880,.12,'triangle',.05); setTimeout(()=>beep(1180,.16,'triangle',.05),130); }
    updateHud(); gameover.classList.remove('hidden');
  }

  async function runCountdown(){
    countdown.classList.remove('hidden');
    for(const v of ['3','2','1','GO!']){
      countdown.textContent=v; beep(v==='GO!'?880:440,.06,'square',.025); await new Promise(r=>setTimeout(r,v==='GO!'?500:650));
    }
    countdown.classList.add('hidden'); started=true; last=performance.now();
  }

  async function startExperience(){
    intro.classList.add('hidden'); hud.classList.remove('hidden'); resetGame(); running=true;
    try{ await initPose(); mouseFallback=false; statusText.textContent='PEMAIN TERDETEKSI'; }
    catch(e){ console.error(e); mouseFallback=true; statusText.textContent='MODE MOUSE'; flashMessage('Kamera gagal — mode mouse aktif'); }
    await runCountdown();
  }

  async function initPose(){
    if(!window.Pose||!window.Camera) throw new Error('MediaPipe gagal dimuat');
    pose=new Pose({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`});
    pose.setOptions({modelComplexity:0,smoothLandmarks:true,enableSegmentation:false,minDetectionConfidence:.55,minTrackingConfidence:.5});
    pose.onResults(onPose);
    camera=new Camera(cameraEl,{onFrame:async()=>{ if(running&&cameraEl.readyState>=2) await pose.send({image:cameraEl}); },width:640,height:480});
    await camera.start();
  }

  function onPose(res){
    const lm=res.poseLandmarks;
    if(!lm){ playerSeen=false; statusText.textContent='MENCARI PEMAIN...'; player.handsUp=false; player.shield=false; return; }
    playerSeen=true; statusText.textContent='TRACKING AKTIF';
    const lSh=lm[11],rSh=lm[12],lWr=lm[15],rWr=lm[16];
    const cx=(lSh.x+rSh.x)/2;
    player.targetX=(1-cx)*W;
    player.handsUp=(lWr.y<lSh.y-.055 && rWr.y<rSh.y-.055);
    player.shield=player.handsUp && shield>1;
    if(player.handsUp && !lastHandsUp){ shieldCallout.classList.remove('hidden'); setTimeout(()=>shieldCallout.classList.add('hidden'),700); beep(560,.07,'sine',.035); }
    lastHandsUp=player.handsUp;
    if(cameraVisible) drawPose(lm);
  }

  function drawPose(lm){
    const w=cameraWrap.clientWidth,h=cameraWrap.clientHeight;octx.clearRect(0,0,w,h);octx.save();
    octx.strokeStyle='rgba(84,230,255,.88)';octx.fillStyle='rgba(126,99,255,.98)';octx.lineWidth=1.4;
    const links=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
    links.forEach(([a,b])=>{octx.beginPath();octx.moveTo((1-lm[a].x)*w,lm[a].y*h);octx.lineTo((1-lm[b].x)*w,lm[b].y*h);octx.stroke();});
    [11,12,13,14,15,16,23,24,25,26,27,28].forEach(i=>{octx.beginPath();octx.arc((1-lm[i].x)*w,lm[i].y*h,2.5,0,Math.PI*2);octx.fill();});
    octx.restore();
  }

  function drawBackground(dt){
    ctx.fillStyle='#030611';ctx.fillRect(0,0,W,H);
    const g=ctx.createRadialGradient(player.x,player.y,0,player.x,player.y,Math.max(W,H)*.72);g.addColorStop(0,'rgba(38,59,131,.22)');g.addColorStop(1,'rgba(1,2,8,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    stars.forEach(s=>{s.y+=s.s*dt*.05;if(s.y>H){s.y=0;s.x=Math.random()*W}ctx.fillStyle=`rgba(180,213,255,${s.a})`;ctx.fillRect(s.x,s.y,s.r,s.r)});
    const floorY=H*.91;ctx.strokeStyle='rgba(79,112,220,.13)';ctx.lineWidth=1;
    for(let x=-W;x<W*2;x+=70){ctx.beginPath();ctx.moveTo(W/2,floorY-130);ctx.lineTo(x,floorY+40);ctx.stroke()}
    for(let y=floorY-110;y<floorY+50;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
  }

  function drawAstronaut(){
    const x=player.x,y=player.y;
    const dx=player.targetX-player.x; player.tilt += (Math.max(-.22,Math.min(.22,dx*.004))-player.tilt)*.14;
    player.jet += ((Math.abs(dx)>8?1:.35)-player.jet)*.12;
    ctx.save();ctx.translate(x,y);ctx.rotate(player.tilt);

    if(player.shield && shield>0){
      ctx.save();ctx.globalCompositeOperation='screen';
      const r=52+Math.sin(performance.now()*.008)*3;
      const sg=ctx.createRadialGradient(0,0,28,0,0,r+10);sg.addColorStop(0,'rgba(90,255,208,.04)');sg.addColorStop(.72,'rgba(73,225,255,.08)');sg.addColorStop(1,'rgba(106,255,183,.26)');ctx.fillStyle=sg;ctx.beginPath();ctx.arc(0,0,r+10,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(106,255,183,.85)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle='rgba(84,230,255,.22)';ctx.beginPath();ctx.arc(0,0,r-7,0,Math.PI*2);ctx.stroke();ctx.restore();
    }

    // jet flames
    ctx.save();ctx.globalCompositeOperation='lighter';
    const flame=15+player.jet*12+Math.sin(performance.now()*.02)*3;
    for(const ox of [-9,9]){const j=ctx.createLinearGradient(ox,31,ox,31+flame);j.addColorStop(0,'rgba(255,255,255,.9)');j.addColorStop(.25,'rgba(84,230,255,.9)');j.addColorStop(1,'rgba(122,98,255,0)');ctx.fillStyle=j;ctx.beginPath();ctx.moveTo(ox-4,28);ctx.lineTo(ox+4,28);ctx.lineTo(ox,31+flame);ctx.closePath();ctx.fill()}ctx.restore();

    // legs
    ctx.strokeStyle='#d9f8ff';ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-9,20);ctx.lineTo(-11,35);ctx.moveTo(9,20);ctx.lineTo(11,35);ctx.stroke();
    // body
    const bg=ctx.createLinearGradient(0,-22,0,24);bg.addColorStop(0,'#effdff');bg.addColorStop(.55,'#b6dff0');bg.addColorStop(1,'#6a9cc6');ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(-20,-20,40,46,11);ctx.fill();ctx.strokeStyle='rgba(226,250,255,.95)';ctx.lineWidth=2;ctx.stroke();
    // backpack
    ctx.fillStyle='#355277';ctx.beginPath();ctx.roundRect(15,-13,10,29,4);ctx.fill();
    // chest badge
    ctx.fillStyle='#0d2d54';ctx.beginPath();ctx.arc(0,2,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#61e9ff';ctx.font='900 9px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('A',0,2.5);
    // arms based on shield
    ctx.strokeStyle='#d9f8ff';ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();
    if(player.shield){ctx.moveTo(-16,-12);ctx.lineTo(-30,-34);ctx.lineTo(-25,-54);ctx.moveTo(16,-12);ctx.lineTo(30,-34);ctx.lineTo(25,-54)}
    else{ctx.moveTo(-16,-10);ctx.lineTo(-28,5);ctx.lineTo(-30,20);ctx.moveTo(16,-10);ctx.lineTo(28,5);ctx.lineTo(30,20)}ctx.stroke();
    // helmet
    ctx.fillStyle='#eafcff';ctx.beginPath();ctx.arc(0,-38,24,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#bdf7ff';ctx.lineWidth=2.4;ctx.stroke();
    const visor=ctx.createLinearGradient(-12,-52,15,-27);visor.addColorStop(0,'#0c1d3d');visor.addColorStop(.55,'#153b6b');visor.addColorStop(1,'#41dcff');ctx.fillStyle=visor;ctx.beginPath();ctx.ellipse(0,-39,16,11,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(184,245,255,.55)';ctx.stroke();
    ctx.fillStyle='#6affb7';ctx.beginPath();ctx.arc(16,-52,2.5,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawMeteor(o){
    ctx.save();ctx.globalCompositeOperation='lighter';
    const tail=ctx.createLinearGradient(o.x,o.y-o.r*3,o.x,o.y);tail.addColorStop(0,'rgba(255,82,155,0)');tail.addColorStop(1,'rgba(255,123,203,.42)');ctx.fillStyle=tail;ctx.beginPath();ctx.moveTo(o.x-o.r*.65,o.y);ctx.lineTo(o.x,o.y-o.r*3.5);ctx.lineTo(o.x+o.r*.65,o.y);ctx.closePath();ctx.fill();
    const rg=ctx.createRadialGradient(o.x,o.y,0,o.x,o.y,o.r*2.4);rg.addColorStop(0,'rgba(255,238,255,.9)');rg.addColorStop(.2,'rgba(255,105,205,.7)');rg.addColorStop(.52,'rgba(116,80,255,.24)');rg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=rg;ctx.beginPath();ctx.arc(o.x,o.y,o.r*2.4,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.rot);ctx.fillStyle='#a24f91';ctx.strokeStyle='#ff8fd7';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5,r=i%2?o.r*.72:o.r;const px=Math.cos(a)*r,py=Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='rgba(40,16,53,.55)';for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(Math.cos(i*2.1)*o.r*.35,Math.sin(i*2.1)*o.r*.32,o.r*.13,0,Math.PI*2);ctx.fill()}ctx.restore();
  }

  function drawUfo(o){
    ctx.save();ctx.translate(o.x,o.y);ctx.rotate(Math.sin(performance.now()*.004+o.phase)*.08);ctx.globalCompositeOperation='lighter';
    const glow=ctx.createRadialGradient(0,0,0,0,0,o.r*2.3);glow.addColorStop(0,'rgba(91,238,255,.28)');glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,o.r*2.3,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='#5bcfe5';ctx.beginPath();ctx.ellipse(0,2,o.r*1.1,o.r*.38,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#baf8ff';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#162a54';ctx.beginPath();ctx.arc(0,-4,o.r*.52,Math.PI,0);ctx.lineTo(o.r*.52,-2);ctx.lineTo(-o.r*.52,-2);ctx.closePath();ctx.fill();ctx.strokeStyle='#70ebff';ctx.stroke();
    for(const px of [-.55,0,.55]){ctx.fillStyle='#ff77cc';ctx.beginPath();ctx.arc(px*o.r,5,2.6,0,Math.PI*2);ctx.fill()}
    ctx.restore();
  }

  function drawLaser(o){
    ctx.save();ctx.globalCompositeOperation='lighter';
    const lg=ctx.createLinearGradient(o.x-o.w*3,0,o.x+o.w*3,0);lg.addColorStop(0,'rgba(255,70,165,0)');lg.addColorStop(.4,'rgba(255,70,165,.38)');lg.addColorStop(.5,'rgba(255,255,255,.95)');lg.addColorStop(.6,'rgba(255,70,165,.38)');lg.addColorStop(1,'rgba(255,70,165,0)');ctx.fillStyle=lg;ctx.fillRect(o.x-o.w*3,o.y,o.w*6,o.h);ctx.restore();ctx.fillStyle='#ff74c9';ctx.fillRect(o.x-o.w/2,o.y,o.w,o.h);
  }

  function update(dt){
    if(!started||over) return;
    player.x+=(player.targetX-player.x)*.14;
    if(player.shield) shield=Math.max(0,shield-dt*.018); else shield=Math.min(100,shield+dt*.0065);
    difficulty=1+score/900;
    spawnTimer-=dt;
    if(spawnTimer<=0){spawnObstacle();spawnTimer=(Math.max(185,650-difficulty*28)+Math.random()*250)*modes[gameMode].spawn}

    for(const o of obstacles){
      o.y+=o.vy*dt*.06;
      if(o.rot!=null) o.rot+=o.vr*dt*.06;
      let collided=false;
      if(o.type==='laser') collided=Math.abs(o.x-player.x)<(o.w*.5+player.r*.7) && player.y+player.r>o.y && player.y-player.r<o.y+o.h;
      else collided=Math.hypot(o.x-player.x,o.y-player.y)<o.r+player.r*.75;
      if(collided){o.dead=true;hit(o)}
      else if(o.y>player.y+70&&!o.near){o.near=true;dodged++;combo=Math.min(9,combo+1);maxCombo=Math.max(maxCombo,combo);score+=20*combo*modes[gameMode].score;if(combo>=5) beep(620+combo*30,.04,'triangle',.018)}
    }
    obstacles=obstacles.filter(o=>!o.dead&&o.y<H+220);score+=dt*.012*combo*modes[gameMode].score;
    updateHud();
  }

  function render(dt){
    drawBackground(dt);
    for(const o of obstacles){if(o.type==='meteor')drawMeteor(o);else if(o.type==='ufo')drawUfo(o);else drawLaser(o)}
    ctx.save();ctx.globalCompositeOperation='lighter';
    sparks=sparks.filter(s=>s.life>0);for(const s of sparks){s.x+=s.vx*dt*.055;s.y+=s.vy*dt*.055;s.vx*=.98;s.vy*=.98;s.life-=dt*.002;ctx.fillStyle=`rgba(${s.color},${Math.max(0,s.life)})`;ctx.beginPath();ctx.arc(s.x,s.y,s.size,0,Math.PI*2);ctx.fill()}ctx.restore();
    drawAstronaut();
  }

  function loop(now){const dt=Math.min(32,now-last);last=now;update(dt);render(dt);requestAnimationFrame(loop)}

  function selectGameMode(mode){
    if(!modes[mode]) return;
    gameMode=mode;
    [difficultyEl, gameoverDifficultyEl].forEach(group=>{
      if(!group) return;
      group.querySelectorAll('button[data-mode]').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));
    });
    modeResult.textContent=modes[gameMode].label;
    beep(520,.05,'triangle',.02);
  }

  difficultyEl.addEventListener('click',e=>{const b=e.target.closest('button[data-mode]');if(!b)return;selectGameMode(b.dataset.mode)});
  gameoverDifficultyEl.addEventListener('click',e=>{const b=e.target.closest('button[data-mode]');if(!b)return;selectGameMode(b.dataset.mode)});
  soundBtn.addEventListener('click',()=>{soundOn=!soundOn;soundBtn.textContent=soundOn?'🔊 Suara':'🔇 Suara'});
  cameraBtn.addEventListener('click',()=>{cameraVisible=!cameraVisible;cameraWrap.classList.toggle('hidden',!cameraVisible)});
  fullscreenBtn.addEventListener('click',async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch(_){}});
  restartBtn.addEventListener('click',async()=>{resetGame();await runCountdown()});
  playAgainBtn.addEventListener('click',async()=>{resetGame();await runCountdown()});
  startBtn.addEventListener('click',startExperience);
  addEventListener('pointermove',e=>{if(mouseFallback&&running){player.targetX=e.clientX;playerSeen=true;statusText.textContent='MODE MOUSE'}});
  addEventListener('pointerdown',()=>{if(mouseFallback&&running){player.shield=true;shieldCallout.classList.remove('hidden');setTimeout(()=>{player.shield=false;shieldCallout.classList.add('hidden')},900)}});
  addEventListener('keydown',e=>{if(e.code==='Space'&&mouseFallback){player.shield=true;setTimeout(()=>player.shield=false,900)}if(e.key.toLowerCase()==='f')fullscreenBtn.click()});
  addEventListener('resize',resize);

  resize();resetGame();requestAnimationFrame(loop);
})();
