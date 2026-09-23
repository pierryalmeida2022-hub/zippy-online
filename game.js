import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const socket = io("https://zippy-online.onrender.com", {
  transports: ["websocket", "polling"]
});

const menu = document.getElementById("menu");
const hud = document.getElementById("hud");
const statusEl = document.getElementById("status");
const nameEl = document.getElementById("playerName");
const roomEl = document.getElementById("roomCode");
const roomLabel = document.getElementById("roomLabel");
const countEl = document.getElementById("playerCount");
const messageEl = document.getElementById("message");

let connected = false;
let gameStarted = false;
let myId = null;
let roomCode = "";
let lastSend = 0;
let jumpVelocity = 0;
let grounded = true;
let boost = 100;
let dashCooldown = 0;
const keys = Object.create(null);
const remotePlayers = new Map();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x76c8ff);
scene.fog = new THREE.Fog(0x76c8ff, 90, 800);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1200);
camera.position.set(0, 7, 14);

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x31522f, 1.3));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(100, 180, 80);
sun.castShadow = true;
scene.add(sun);

const grass = new THREE.MeshStandardMaterial({color:0x3e9e48});
const roadMat = new THREE.MeshStandardMaterial({color:0x555b62});
const trunkMat = new THREE.MeshStandardMaterial({color:0x6d431f});
const leafMat = new THREE.MeshStandardMaterial({color:0x1e853b});
const ringMat = new THREE.MeshStandardMaterial({color:0xffd52e, metalness:.7, roughness:.2});

const ground = new THREE.Mesh(new THREE.BoxGeometry(700,2,1900), grass);
ground.position.set(0,-1,-650);
ground.receiveShadow = true;
scene.add(ground);

const road = new THREE.Mesh(new THREE.BoxGeometry(90,.18,1900), roadMat);
road.position.set(0,.04,-650);
scene.add(road);

function addTree(x,z,scale=1){
  const g = new THREE.Group();
  g.position.set(x,0,z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.45,.62,4.5,8),trunkMat);
  trunk.position.y=2.25; trunk.castShadow=true; g.add(trunk);
  for(let i=0;i<3;i++){
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.9,10,8),leafMat);
    crown.position.set((Math.random()-.5)*1.3,4.5+i*.9,(Math.random()-.5)*1.3);
    crown.scale.setScalar(scale); crown.castShadow=true; g.add(crown);
  }
  scene.add(g);
}
for(let z=250;z>-1550;z-=28){
  addTree(-52-Math.random()*28,z,.9+Math.random()*.35);
  addTree(52+Math.random()*28,z,.9+Math.random()*.35);
}

function createPlayer(color=0x168cff){
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({color});
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.2,18,14),mat);
  body.scale.set(1,1.15,.9); body.castShadow=true; g.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(.7,14,10),
    new THREE.MeshStandardMaterial({color:0xf1d0a0}));
  belly.position.set(0,0,-.8); belly.scale.set(1,1.1,.4); g.add(belly);

  const head = new THREE.Mesh(new THREE.SphereGeometry(.88,18,14),mat);
  head.position.y=1.25; head.castShadow=true; g.add(head);

  const white = new THREE.MeshStandardMaterial({color:0xffffff});
  const black = new THREE.MeshStandardMaterial({color:0x111111});
  for(const s of [-.28,.28]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.23,10,10),white);
    eye.position.set(s,1.4,-.75); g.add(eye);
    const pupil=new THREE.Mesh(new THREE.SphereGeometry(.1,8,8),black);
    pupil.position.set(s,1.4,-.95); g.add(pupil);
  }

  for(let i=0;i<5;i++){
    const spike=new THREE.Mesh(new THREE.ConeGeometry(.32,1.05,8),mat);
    spike.rotation.x=-Math.PI/2;
    spike.position.set((i-2)*.34,1,.88);
    g.add(spike);
  }

  const limbMat=new THREE.MeshStandardMaterial({color:0x174fa3});
  const armL=new THREE.Mesh(new THREE.CapsuleGeometry(.18,.65,5,8),mat);
  armL.position.set(-1.08,.35,0); armL.rotation.z=-.5; g.add(armL);
  const armR=armL.clone(); armR.position.x=1.08; armR.rotation.z=.5; g.add(armR);
  const legL=new THREE.Mesh(new THREE.CapsuleGeometry(.22,.68,5,8),limbMat);
  legL.position.set(-.42,-1,0); g.add(legL);
  const legR=legL.clone(); legR.position.x=.42; g.add(legR);

  g.userData = {armL,armR,legL,legR};
  return g;
}

const player = createPlayer();
player.position.set(0,1.5,250);
scene.add(player);

function addRing(x,z){
  const r=new THREE.Mesh(new THREE.TorusGeometry(.42,.11,10,20),ringMat);
  r.position.set(x,2.2,z); r.rotation.x=Math.PI/2; scene.add(r);
}
for(let z=220;z>-1500;z-=18){
  addRing(0,z);
  if(Math.abs(z)%72<1){ addRing(-3.5,z-4); addRing(3.5,z-4); }
}

function addEnemy(x,z){
  const e=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),
    new THREE.MeshStandardMaterial({color:0xff4a35}));
  e.position.set(x,1,z); e.castShadow=true; scene.add(e);
}
for(let z=180;z>-1450;z-=100) addEnemy((Math.random()-.5)*45,z);

function setStatus(text){ statusEl.textContent=text; }
function showMessage(text){
  messageEl.textContent=text;
  clearTimeout(showMessage.t);
  showMessage.t=setTimeout(()=>messageEl.textContent="",1400);
}

socket.on("connect",()=>{
  connected=true;
  myId=socket.id;
  setStatus("Servidor conectado. Crie ou entre em uma sala.");
});
socket.on("connect_error",()=>{
  connected=false;
  setStatus("Não foi possível conectar ao servidor. Ele precisa estar online.");
});
socket.on("disconnect",()=>{
  connected=false;
  if(gameStarted) showMessage("Conexão perdida.");
});

function validateName(){
  const name=(nameEl.value||"").trim().replace(/[<>]/g,"");
  if(!name) return "ZippyPlayer";
  return name.slice(0,16);
}
function cleanRoom(){
  return (roomEl.value||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
}

document.getElementById("createBtn").addEventListener("click",()=>{
  if(!connected) return setStatus("Aguarde a conexão com o servidor.");
  socket.emit("createRoom",{name:validateName()},reply=>{
    if(!reply?.ok) return setStatus(reply?.error||"Não foi possível criar a sala.");
    enterGame(reply.room);
  });
});

document.getElementById("joinBtn").addEventListener("click",()=>{
  if(!connected) return setStatus("Aguarde a conexão com o servidor.");
  const room=cleanRoom();
  if(!room) return setStatus("Digite o código da sala.");
  socket.emit("joinRoom",{room,name:validateName()},reply=>{
    if(!reply?.ok) return setStatus(reply?.error||"Não foi possível entrar.");
    enterGame(reply.room);
  });
});

document.getElementById("copyRoomBtn").addEventListener("click",async()=>{
  const text=roomCode;
  try{
    await navigator.clipboard.writeText(text);
    showMessage("Código copiado!");
  }catch{
    showMessage("Código: "+text);
  }
});

function enterGame(room){
  roomCode=room;
  roomLabel.textContent=roomCode;
  menu.style.display="none";
  hud.style.display="flex";
  gameStarted=true;
  setStatus("Conectado");
  showMessage("Você entrou na sala "+roomCode);
  socket.emit("requestState");
}

socket.on("roomState",data=>{
  if(!data) return;
  countEl.textContent=Object.keys(data.players||{}).length;
  for(const [id,p] of Object.entries(data.players||{})){
    if(id===myId) continue;
    upsertRemote(id,p);
  }
});

socket.on("playerJoined",p=>{
  if(p.id===myId) return;
  upsertRemote(p.id,p);
  showMessage(p.name+" entrou na sala!");
  updateCount();
});

socket.on("playerMoved",p=>{
  if(p.id===myId) return;
  upsertRemote(p.id,p);
});

socket.on("playerLeft",id=>{
  removeRemote(id);
  updateCount();
});

function updateCount(){ countEl.textContent=String(remotePlayers.size+1); }

function upsertRemote(id,p){
  let entry=remotePlayers.get(id);
  if(!entry){
    const model=createPlayer(Number(p.color)||0xff55aa);
    scene.add(model);
    entry={model,target:new THREE.Vector3(),targetRot:0,name:p.name||"Jogador"};
    remotePlayers.set(id,entry);
    addNameTag(entry.model,entry.name);
  }
  entry.target.set(Number(p.x)||0,Number(p.y)||1.5,Number(p.z)||0);
  entry.targetRot=Number(p.ry)||0;
}

function addNameTag(model,name){
  const canvas=document.createElement("canvas");
  canvas.width=512; canvas.height=128;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="rgba(0,0,0,.7)";
  ctx.roundRect?.(8,20,496,88,20);
  ctx.fill();
  ctx.fillStyle="#fff"; ctx.font="bold 44px Arial"; ctx.textAlign="center";
  ctx.fillText(name,256,78);
  const tex=new THREE.CanvasTexture(canvas);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));
  sprite.scale.set(4,1,1);
  sprite.position.y=3.2;
  model.add(sprite);
}

function removeRemote(id){
  const entry=remotePlayers.get(id);
  if(!entry) return;
  scene.remove(entry.model);
  remotePlayers.delete(id);
}

function updateRemote(dt){
  for(const entry of remotePlayers.values()){
    entry.model.position.lerp(entry.target,Math.min(1,dt*10));
    entry.model.rotation.y=THREE.MathUtils.lerp(entry.model.rotation.y,entry.targetRot,Math.min(1,dt*10));
    const moving=entry.model.position.distanceTo(entry.target)>.03;
    if(moving){
      const t=performance.now()/80;
      entry.model.userData.legL.rotation.x=Math.sin(t)*.55;
      entry.model.userData.legR.rotation.x=Math.sin(t+Math.PI)*.55;
    }
  }
}

function jump(){
  if(!gameStarted || !grounded) return;
  jumpVelocity=14; grounded=false;
}

function dash(){
  if(!gameStarted || dashCooldown>0) return;
  dashCooldown=.8;
  player.position.z-=12;
}

window.addEventListener("keydown",e=>{
  if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) e.preventDefault();
  keys[e.code]=true;
  if(e.code==="Space") jump();
  if(e.code==="KeyE") dash();
});
window.addEventListener("keyup",e=>keys[e.code]=false);

function updatePlayer(dt){
  if(!gameStarted) return;

  let speed=32;
  const boosting=keys.ShiftLeft||keys.ShiftRight;
  if(boosting && boost>0){speed=70;boost-=45*dt}else boost=Math.min(100,boost+16*dt);

  if(keys.KeyW||keys.ArrowUp) player.position.z-=speed*dt;
  if(keys.KeyS||keys.ArrowDown) player.position.z+=speed*.65*dt;
  if(keys.KeyA||keys.ArrowLeft) player.position.x-=22*dt;
  if(keys.KeyD||keys.ArrowRight) player.position.x+=22*dt;

  player.position.x=THREE.MathUtils.clamp(player.position.x,-38,38);

  jumpVelocity-=35*dt;
  player.position.y+=jumpVelocity*dt;
  if(player.position.y<=1.5){
    player.position.y=1.5;
    jumpVelocity=0;
    grounded=true;
  }

  if(dashCooldown>0) dashCooldown-=dt;

  const moving=(keys.KeyW||keys.ArrowUp||keys.KeyS||keys.ArrowDown);
  if(moving && grounded){
    const t=performance.now()/80;
    player.userData.legL.rotation.x=Math.sin(t)*.7;
    player.userData.legR.rotation.x=Math.sin(t+Math.PI)*.7;
    player.userData.armL.rotation.x=Math.sin(t+Math.PI)*.45;
    player.userData.armR.rotation.x=Math.sin(t)*.45;
  }

  if(keys.KeyQ) player.rotation.z+=14*dt;
  else{
    player.rotation.z=THREE.MathUtils.lerp(player.rotation.z,0,.2);
    player.rotation.x=THREE.MathUtils.lerp(player.rotation.x,0,.2);
  }

  if(performance.now()-lastSend>50){
    lastSend=performance.now();
    socket.emit("playerMove",{
      x:Number(player.position.x.toFixed(2)),
      y:Number(player.position.y.toFixed(2)),
      z:Number(player.position.z.toFixed(2)),
      ry:Number(player.rotation.y.toFixed(2))
    });
  }
}

function updateCamera(){
  const target=new THREE.Vector3(player.position.x,player.position.y+4,player.position.z+13);
  camera.position.lerp(target,.09);
  camera.lookAt(player.position.x,player.position.y+1,player.position.z-10);
}

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05);
  updatePlayer(dt);
  updateRemote(dt);
  updateCamera();
  renderer.render(scene,camera);
}
const clock=new THREE.Clock();
animate();

addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
