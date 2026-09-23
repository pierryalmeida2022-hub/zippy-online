import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ===== ONLINE =====
const SERVER_URL = location.hostname==='localhost' ? 'http://localhost:3000' : 'https://zippy-online.onrender.com';
const socket = io(SERVER_URL,{transports:['websocket','polling']});
let myId=null,roomCode=null,started=false;
const remote=new Map();
const $=id=>document.getElementById(id);
const menu=$('menu'),hud=$('hud'),status=$('status');
socket.on('connect',()=>{myId=socket.id;status.textContent='Servidor conectado.'});
socket.on('connect_error',()=>status.textContent='Servidor indisponível. Se estiver no Render, aguarde o serviço iniciar.');
socket.on('roomError',d=>status.textContent=d.message||'Erro');
socket.on('roomCreated',d=>launch(d.room,d.players));
socket.on('roomJoined',d=>launch(d.room,d.players));
socket.on('playerJoined',p=>{if(!started)return;addRemote(p);$('playerCount').textContent=String(remote.size+1);toast(p.name+' entrou no mundo')});
socket.on('playerMoved',p=>{if(p.id!==myId)addRemote(p)});
socket.on('playerLeft',p=>{removeRemote(p.id);$('playerCount').textContent=String(remote.size+1)});
socket.on('roomState',d=>{if(!started)return;(d.players||[]).forEach(p=>{if(p.id!==myId)addRemote(p)});$('playerCount').textContent=String(d.players?.length||1)});
$('createBtn').onclick=()=>{const name=($('nameInput').value.trim()||'Zippy').slice(0,16);socket.emit('createRoom',{name})};
$('joinBtn').onclick=()=>{const name=($('nameInput').value.trim()||'Zippy').slice(0,16),code=$('roomInput').value.trim().toUpperCase();if(code)socket.emit('joinRoom',{name,room:code});else status.textContent='Digite o código da sala.'};
$('roomInput').onkeydown=e=>{if(e.key==='Enter')$('joinBtn').click()};

// ===== THREE =====
let scene,camera,renderer,clock,player,playerVisual,worldGroup;
const remoteGroup=new THREE.Group();const particles=[];const enemies=[];const collectibles=[];const tracks=[];const portals=[];const colliders=[];
const keys={};let yaw=0,camYaw=0,camPitch=0.28,camDistance=13,velY=0,onGround=false,boost=0,dash=0,score=0,mission=0,lastNet=0,night=0;
let cameraOrbiting=false;
const W=3200,H=W/2;
const zones=[
 {name:'PRADARIA',x:-850,z:650,color:0x4e9d54,kind:'grass'},
 {name:'DESERTO',x:900,z:700,color:0xc99550,kind:'desert'},
 {name:'GELEIRA',x:900,z:-750,color:0xd9edf3,kind:'snow'},
 {name:'SELVA',x:-850,z:-700,color:0x1e6f45,kind:'jungle'},
 {name:'VULCÃO',x:0,z:-250,color:0x583d3d,kind:'volcano'},
 {name:'CIDADE',x:0,z:700,color:0x405267,kind:'city'},
 {name:'LITORAL',x:0,z:-1050,color:0x3c8b91,kind:'coast'}
];
function mat(c,r=.8,m=0,e=0){return new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,emissive:e})}
function box(w,h,d,m){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m)}
function cyl(r,h,m,s=12){return new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,s),m)}
function sphere(r,m,s=16){return new THREE.Mesh(new THREE.SphereGeometry(r,s,s),m)}
function noise(x,z){return (Math.sin(x*.018)+Math.sin(z*.021)*.7+Math.sin((x+z)*.009)*.45)*7}
function groundHeight(x,z){let y=noise(x,z);if(z<-950)y+=Math.max(0,(z+950)*.08);if(Math.abs(x)<230&&z<-80&&z>-550)y+=Math.sin(x*.012)*8;return y}
function zoneAt(x,z){let best=zones[0],bd=1e9;for(const q of zones){let d=(x-q.x)**2+(z-q.z)**2;if(d<bd){bd=d;best=q}}return best}
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2400)}
function playerModel(color=0x27d8ff){const g=new THREE.Group();const body=box(1.35,1.45,1.05,mat(color,.42,.12));body.position.y=1.25;g.add(body);const belly=sphere(.5,mat(0xeaf8ff,.45));belly.scale.set(1,.72,.42);belly.position.set(0,1.22,.55);g.add(belly);const head=sphere(.83,mat(color,.38,.16));head.position.y=2.32;g.add(head);const visor=box(1.18,.27,.12,mat(0x081827,.2,.8));visor.position.set(0,2.4,.75);g.add(visor);for(const x of[-.48,.48]){const foot=box(.42,.32,.78,mat(0xf6fbff,.38));foot.position.set(x,.3,.12);g.add(foot);const arm=box(.3,.85,.34,mat(color,.42,.1));arm.position.set(x*1.65,1.3,0);g.add(arm)}const aura=sphere(.94,mat(0xffffff,.25,.9));aura.scale.set(1,.15,1);aura.position.y=3.25;aura.material.transparent=true;aura.material.opacity=.14;g.add(aura);g.userData.aura=aura;return g}
function tag(parent,name,color){const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');x.fillStyle='#07101ddd';x.roundRect(6,6,244,52,14);x.fill();x.textAlign='center';x.font='900 24px Arial';x.fillStyle=color;x.fillText(name,128,41);const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false}));sp.scale.set(4.3,1.08,1);sp.position.y=4.1;parent.add(sp)}
function addRemote(p){if(p.id===myId)return;let o=remote.get(p.id);if(!o){o=new THREE.Group();o.userData.target=new THREE.Vector3(p.x||0,p.y||0,p.z||20);o.userData.ry=p.ry||0;o.userData.visual=playerModel(p.color||0x9b72ff);o.add(o.userData.visual);tag(o,p.name||'Player','#8ff2ff');remoteGroup.add(o);remote.set(p.id,o)}o.userData.target.set(p.x||0,p.y||0,p.z||20);o.userData.ry=p.ry||0}
function removeRemote(id){const o=remote.get(id);if(o){remoteGroup.remove(o);remote.delete(id)}}

// ===== WORLD BUILD =====
function terrain(){const seg=140,size=W;const geo=new THREE.PlaneGeometry(size,size,seg,seg);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position;const colors=[];for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),q=zoneAt(x,z);pos.setY(i,groundHeight(x,z));const c=new THREE.Color(q.color);c.offsetHSL((Math.sin(x*.01+z*.013)*.015),0,.03);colors.push(c.r,c.g,c.b)}geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:0});const g=new THREE.Mesh(geo,m);g.receiveShadow=true;scene.add(g);worldGroup.add(g)}
function water(){const m=mat(0x167f9c,.18,.15,0x022630);m.transparent=true;m.opacity=.8;const w=box(2600,.5,600,m);w.position.set(0,-2,-1180);w.receiveShadow=true;scene.add(w);for(let i=0;i<22;i++){const r=ringMesh(10+Math.random()*25,mat(0x65eaff,.2,.3));r.rotation.x=-Math.PI/2;r.position.set((Math.random()-.5)*2300,-1.4,-1050-Math.random()*180);scene.add(r)}}
function ringMesh(r,m){return new THREE.Mesh(new THREE.RingGeometry(r*.6,r,m?24:16),m)}
function tree(x,z,type='tree'){const q=zoneAt(x,z);let g=new THREE.Group();if(type==='palm'){const tr=cyl(.35,7,mat(0x704d2e));tr.position.y=3.5;g.add(tr);for(let i=0;i<7;i++){const l=box(1.1,.15,4,mat(0x3f9a43));l.position.y=7;l.rotation.y=i*Math.PI/3;l.rotation.x=-.25;g.add(l)}}else{const tr=cyl(.28,3,mat(0x60432d));tr.position.y=1.5;g.add(tr);const crown=sphere(type==='pine'?2.2:2.5,mat(type==='pine'?0x315e4c:0x2e8b45),10);crown.position.y=4;g.add(crown);if(type==='pine'){const c2=sphere(1.6,mat(0x244d3f),10);c2.position.y=5.3;g.add(c2)}}g.position.set(x,groundHeight(x,z),z);g.scale.setScalar(.75+Math.random()*.7);g.rotation.y=Math.random()*6.28;g.traverse(o=>{if(o.isMesh)o.castShadow=true});scene.add(g)}
function rock(x,z,kind='rock'){const q=zoneAt(x,z);const g=new THREE.Group();const r=sphere(1,mat(kind==='snow'?0xbdd6df:kind==='lava'?0x4b2520:0x555d61,.95),8);r.scale.set(1.2+Math.random()*2,.6+Math.random(),1+Math.random()*1.5);g.add(r);g.position.set(x,groundHeight(x,z)+.25,z);g.rotation.set(Math.random(),Math.random(),Math.random());g.traverse(o=>{if(o.isMesh)o.castShadow=true});scene.add(g)}
function building(x,z,w,d,h){const g=new THREE.Group();const body=box(w,h,d,mat(0x536476,.72,.18));body.position.y=h/2;g.add(body);const roof=box(w*1.08,.35,d*1.08,mat(0x202a35,.45,.4));roof.position.y=h+.18;g.add(roof);for(let y=2;y<h-1;y+=2.2)for(let xx=-w*.3;xx<w*.31;xx+=Math.max(2.5,w*.28)){const win=box(.75,.7,.06,mat(0x68dfff,.18,.7,0x164a5b));win.position.set(xx,y,d/2+.04);g.add(win)}g.position.set(x,groundHeight(x,z),z);g.rotation.y=(Math.random()>.5?0:Math.PI/2);g.traverse(o=>{if(o.isMesh)o.castShadow=true});scene.add(g);colliders.push({x,z,w:w*.5,d:d*.5})}
function city(){for(let i=0;i<36;i++){const a=Math.random()*6.28,r=120+Math.random()*430;const x=Math.cos(a)*r,z=650+Math.sin(a)*r;if(Math.abs(x)<80)continue;building(x,z,18+Math.random()*25,18+Math.random()*25,10+Math.random()*55)}for(let i=0;i<9;i++){const x=-350+i*90;const road=box(14,.12,820,mat(0x202a30,.95));road.position.set(x,.08,690);scene.add(road)}}
function regionProps(){for(let i=0;i<360;i++){const a=Math.random()*6.28,r=250+Math.random()*520;let x,z;const q=zones[Math.floor(Math.random()*5)];x=q.x+Math.cos(a)*r;z=q.z+Math.sin(a)*r;if(Math.abs(x)>1450||Math.abs(z)>1450)continue;if(q.kind==='jungle')tree(x,z,'tree');else if(q.kind==='desert')tree(x,z,'palm');else if(q.kind==='snow')tree(x,z,'pine');else if(q.kind==='volcano')rock(x,z,'lava');else if(q.kind==='grass')tree(x,z,'tree');else rock(x,z)} }
function volcano(){for(let i=0;i<80;i++){const a=Math.random()*6.28,r=180+Math.random()*300,x=Math.cos(a)*r,z=-250+Math.sin(a)*r;rock(x,z,'lava')}const cone=new THREE.Mesh(new THREE.ConeGeometry(260,330,64),mat(0x27252b,.95));cone.position.set(0,150,-250);scene.add(cone);const lava=new THREE.Mesh(new THREE.CylinderGeometry(62,85,2,48),mat(0xff4a19,.25,.1,0xff2100));lava.position.set(0,315,-250);scene.add(lava)}
function portal(x,z,color=0x66eaff,label='PORTAL'){const g=new THREE.Group();const tor=new THREE.Mesh(new THREE.TorusGeometry(11,1.4,14,40),mat(color,.2,.65,color));tor.position.y=13;g.add(tor);const core=new THREE.Mesh(new THREE.CircleGeometry(9,32),mat(color,.2,.4,color));core.position.set(0,13,0);core.rotation.y=Math.PI;core.material.transparent=true;core.material.opacity=.3;g.add(core);g.position.set(x,groundHeight(x,z),z);g.userData.label=label;scene.add(g);portals.push(g)}
function track(cx,cz,rx,rz,color,name){const g=new THREE.Group();const n=72;const pts=[];for(let i=0;i<n;i++){const a=i/n*Math.PI*2;pts.push(new THREE.Vector3(cx+Math.cos(a)*rx,groundHeight(cx+Math.cos(a)*rx,cz+Math.sin(a)*rz)+.12,cz+Math.sin(a)*rz))}const curve=new THREE.CatmullRomCurve3(pts,true);const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,180,6,8,true),mat(color,.75,.05));g.add(tube);const line=new THREE.Mesh(new THREE.TubeGeometry(curve,180,.25,6,true),mat(0xf8f4d0,.5,.1));line.position.y=.15;g.add(line);scene.add(g);tracks.push({name,cx,cz,rx,rz,color,start:pts[0],curve,active:false,lap:0})}
function collectible(x,z,type='gem'){const g=new THREE.Group();const c=type==='ring'?0xffd43b:0x64e8ff;const o=type==='ring'?new THREE.Mesh(new THREE.TorusGeometry(1.3,.28,10,22),mat(c,.2,.8,c)):new THREE.Mesh(new THREE.OctahedronGeometry(1.1),mat(c,.18,.7,c));g.add(o);g.position.set(x,groundHeight(x,z)+3,z);g.userData={baseY:g.position.y,phase:Math.random()*6.28,type};scene.add(g);collectibles.push(g)}
function enemy(x,z,type=0){const g=new THREE.Group();const colors=[0xff4b61,0xffa82f,0xa96bff,0x42df9b];const body=box(1.5,1.45,1.15,mat(colors[type%4],.45,.15));body.position.y=1.3;g.add(body);const head=sphere(.8,mat(0x111923,.35,.35));head.position.y=2.45;g.add(head);for(const sx of[-.25,.25]){const eye=sphere(.14,mat(0xfff2a0,.15,.7,0xff6d00),10);eye.position.set(sx,2.5,.72);g.add(eye)}for(const sx of[-.8,.8]){const arm=box(.28,.85,.3,mat(colors[type%4],.4,.1));arm.position.set(sx,1.3,0);g.add(arm)}g.position.set(x,groundHeight(x,z),z);g.userData={home:new THREE.Vector3(x,g.position.y,z),phase:Math.random()*6.28,speed:1+Math.random()*1.8,type};scene.add(g);enemies.push(g)}
function buildWorld(){worldGroup=new THREE.Group();scene.add(worldGroup);terrain();water();city();regionProps();volcano();portal(-850,650,0x55eaff,'PRADARIA');portal(900,700,0xffcc66,'DESERTO');portal(900,-750,0xd9f5ff,'GELEIRA');portal(-850,-700,0x58ff9a,'SELVA');portal(0,-250,0xff4a24,'VULCÃO');portal(0,700,0x8c9cff,'CIDADE');portal(0,-1040,0x55eaff,'LITORAL');
 track(-850,650,210,130,0x48e6ff,'SUNSET LOOP');track(900,700,250,155,0xffb83d,'SAND STORM');track(900,-750,230,150,0xd9f8ff,'FROZEN RING');track(-850,-700,220,150,0x55ff93,'JUNGLE RUN');
 for(let i=0;i<75;i++){const q=zones[Math.floor(Math.random()*5)];const a=Math.random()*6.28,r=80+Math.random()*550;collectible(q.x+Math.cos(a)*r,q.z+Math.sin(a)*r,i%3?'gem':'ring')}for(let i=0;i<30;i++){const q=zones[Math.floor(Math.random()*5)];const a=Math.random()*6.28,r=120+Math.random()*450;enemy(q.x+Math.cos(a)*r,q.z+Math.sin(a)*r,i%4)}
 portal(0,350,0xff5edc,'ARENA');for(let i=0;i<12;i++){const a=i*Math.PI/6;enemy(Math.cos(a)*70,350+Math.sin(a)*70,i%4)}
}

// ===== GAME =====
function launch(code,players){if(started)return;started=true;roomCode=code;$('roomCode')?.remove();menu.classList.add('hidden');hud.classList.remove('hidden');init();players?.forEach(p=>{if(p.id!==myId)addRemote(p)});$('playerCount').textContent=String(players?.length||1);toast('Mundo '+code+' criado!')}
function init(){scene=new THREE.Scene();scene.background=new THREE.Color(0x7bb9e6);scene.fog=new THREE.FogExp2(0x7bb9e6,.00065);clock=new THREE.Clock();camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.1,5000);renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;document.body.appendChild(renderer.domElement);scene.add(remoteGroup);
 const hemi=new THREE.HemisphereLight(0xcceeff,0x23301f,1.55);scene.add(hemi);const sun=new THREE.DirectionalLight(0xffffff,3.2);sun.position.set(-600,900,500);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-1400;sun.shadow.camera.right=1400;sun.shadow.camera.top=1400;sun.shadow.camera.bottom=-1400;scene.add(sun);scene.userData.sun=sun;
 const sky=new THREE.Mesh(new THREE.SphereGeometry(2400,32,20),new THREE.MeshBasicMaterial({color:0x8ecdf0,side:THREE.BackSide}));scene.add(sky);scene.userData.sky=sky;
 buildWorld();player=new THREE.Group();playerVisual=playerModel(0x29d8ff);player.add(playerVisual);tag(player,'VOCÊ','#66eaff');player.position.set(0,groundHeight(0,20),20);scene.add(player);camera.position.set(0,9,15);camYaw=player.rotation.y; $('missionText').textContent='Explore os 7 biomas e encontre 3 portais.';window.addEventListener('resize',resize);document.addEventListener('keydown',keydown);document.addEventListener('keyup',e=>keys[e.code]=false);setupCameraControls();requestAnimationFrame(loop)}
function keydown(e){keys[e.code]=true;if(e.code==='KeyM')$('mapCanvas').classList.toggle('map-big');if(e.code==='KeyR'){score=Math.max(0,score-5);toast('Missão reiniciada.')}if(['Space','ShiftLeft','ShiftRight'].includes(e.code))e.preventDefault()}
function resize(){if(!camera)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}
function move(dt){let f=0,s=0;if(keys.KeyW)f++;if(keys.KeyS)f--;if(keys.KeyD)s++;if(keys.KeyA)s--;const len=Math.hypot(f,s)||1;f/=len;s/=len;let sp=keys.ShiftLeft||keys.ShiftRight?42:24;if(boost>0)sp=68;const dir=new THREE.Vector3(s,0,-f).applyAxisAngle(new THREE.Vector3(0,1,0),camYaw);if(f||s){player.position.addScaledVector(dir,sp*dt);yaw=Math.atan2(-dir.x,-dir.z);player.rotation.y=THREE.MathUtils.lerpAngle(player.rotation.y,yaw,.16)}if(keys.Space&&onGround){velY=18;onGround=false}if((keys.KeyQ||keys.KeyE)&&dash<=0&& (f||s)){dash=0.35;boost=0.5;player.position.addScaledVector(dir,30)}velY-=45*dt;player.position.y+=velY*dt;const floor=groundHeight(player.position.x,player.position.z);if(player.position.y<=floor){player.position.y=floor;velY=0;onGround=true}if(Math.abs(player.position.x)>1550)player.position.x=Math.sign(player.position.x)*1550;if(Math.abs(player.position.z)>1550)player.position.z=Math.sign(player.position.z)*1550;dash-=dt;boost-=dt;playerVisual.position.y=onGround?Math.sin(clock.elapsedTime*12)*.03:0;playerVisual.userData.aura.rotation.y+=dt*3;}
function interactions(){const q=zoneAt(player.position.x,player.position.z);$('zone').textContent=q.name;$('coords').textContent=Math.round(player.position.x)+', '+Math.round(player.position.z);const sp=boost>0?68:24;$('speed').textContent=String(Math.round(sp));for(const c of collectibles){if(c.visible&&c.position.distanceTo(player.position)<5){c.visible=false;score+=c.userData.type==='ring'?10:5;toast(c.userData.type==='ring'?'+10 anéis!':'+5 cristal!')}}$('score').textContent=score;$('rank').textContent=score>300?'LENDÁRIO':score>150?'AVENTUREIRO':score>50?'CORREDOR':'EXPLORADOR';for(const p of portals){p.rotation.y=clock.elapsedTime*.5;if(p.position.distanceTo(player.position)<18&&!p.userData.used){p.userData.used=true;score+=30;mission++;toast('Portal '+p.userData.label+' descoberto! +30');setTimeout(()=>p.userData.used=false,1800);$('missionText').textContent=mission>=3?'Todos os portais principais encontrados! Agora explore e corra.':'Encontre mais '+(3-mission)+' portal(is) principal(is).'}}for(const e of enemies){const d=e.position.distanceTo(player.position);if(d<90){const t=clock.elapsedTime+e.userData.phase;e.position.x=e.userData.home.x+Math.cos(t*.7)*18;e.position.z=e.userData.home.z+Math.sin(t*.6)*18;e.position.y=groundHeight(e.position.x,e.position.z);e.rotation.y+=.02}if(d<5&&boost<=0){player.position.addScaledVector(new THREE.Vector3().subVectors(player.position,e.position).normalize(),3);toast('Cuidado! Inimigo atingiu você')}}}
function setupCameraControls(){
 const el=renderer.domElement;
 el.addEventListener('contextmenu',e=>e.preventDefault());
 el.addEventListener('mousedown',e=>{
  if(e.button!==2)return;
  cameraOrbiting=true;
  el.requestPointerLock?.();
 });
 document.addEventListener('mouseup',e=>{
  if(e.button!==2)return;
  cameraOrbiting=false;
  if(document.pointerLockElement===el)document.exitPointerLock?.();
 });
 document.addEventListener('mousemove',e=>{
  if(!cameraOrbiting)return;
  const dx=e.movementX||0,dy=e.movementY||0;
  camYaw-=dx*0.0035;
  camPitch-=dy*0.0028;
  camPitch=THREE.MathUtils.clamp(camPitch,-0.15,0.9);
 });
 el.addEventListener('wheel',e=>{
  e.preventDefault();
  camDistance=THREE.MathUtils.clamp(camDistance+e.deltaY*0.012,6,24);
 },{passive:false});
}
function cameraFollow(dt){
 const target=new THREE.Vector3(player.position.x,player.position.y+3.1,player.position.z);
 const horizontal=Math.cos(camPitch)*camDistance;
 const offset=new THREE.Vector3(Math.sin(camYaw)*horizontal,Math.sin(camPitch)*camDistance,Math.cos(camYaw)*horizontal);
 const desired=target.clone().add(offset);
 camera.position.lerp(desired,1-Math.pow(.001,dt));
 camera.lookAt(target);
}
function remotes(dt){remote.forEach(o=>{o.position.lerp(o.userData.target,1-Math.pow(.0001,dt));o.rotation.y=THREE.MathUtils.lerpAngle(o.rotation.y,o.userData.ry,.12);o.userData.visual.userData.aura.rotation.y+=dt*2})}
function updateCollectibles(){const t=clock.elapsedTime;for(const c of collectibles)if(c.visible){c.position.y=c.userData.baseY+Math.sin(t*2+c.userData.phase)*.6;c.rotation.y+=.02;c.rotation.x+=.008}}
function updateMap(){const c=$('mapCanvas'),x=c.getContext('2d'),w=c.width,h=c.height;x.clearRect(0,0,w,h);x.fillStyle='#07121c';x.fillRect(0,0,w,h);const sc=w/(W);for(const q of zones){x.fillStyle='#'+q.color.toString(16).padStart(6,'0');x.globalAlpha=.28;const px=w/2+q.x*sc,py=h/2+q.z*sc;x.beginPath();x.arc(px,py,35,0,7);x.fill()}x.globalAlpha=1;for(const p of portals){const px=w/2+p.position.x*sc,py=h/2+p.position.z*sc;x.fillStyle='#62eaff';x.fillRect(px-2,py-2,4,4)}x.fillStyle='#fff';x.beginPath();x.arc(w/2+player.position.x*sc,h/2+player.position.z*sc,4,0,7);x.fill();remote.forEach(o=>{x.fillStyle='#b57cff';x.beginPath();x.arc(w/2+o.position.x*sc,h/2+o.position.z*sc,3,0,7);x.fill()})}
function loop(){requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.033);move(dt);interactions();updateCollectibles();remotes(dt);cameraFollow(dt);updateMap();if(performance.now()-lastNet>50){socket.emit('move',{x:player.position.x,y:player.position.y,z:player.position.z,ry:player.rotation.y});lastNet=performance.now()}const t=clock.elapsedTime;const nightAmt=(Math.sin(t*.025)+1)/2;scene.userData.sun.intensity=2.2-nightAmt*1.45;scene.userData.sky.material.color.setHSL(.57,.55,.72-nightAmt*.38);scene.background.copy(scene.userData.sky.material.color);scene.fog.color.copy(scene.background);renderer.render(scene,camera)}
