const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const server = http.createServer((req,res)=>{
  res.writeHead(200,{"Content-Type":"text/plain; charset=utf-8"});
  res.end("Zippy multiplayer server online");
});

const io = new Server(server,{
  cors:{origin:"*",methods:["GET","POST"]},
  transports:["websocket","polling"]
});

const rooms = new Map();
const COLORS=[0x168cff,0xff4f8b,0x8b5cff,0xff9d32,0x28c76f,0xffdf4d,0x26c6da,0xd95cff];

function makeCode(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code="";
  do{
    code="";
    for(let i=0;i<6;i++) code+=chars[Math.floor(Math.random()*chars.length)];
  }while(rooms.has(code));
  return code;
}
function cleanName(name){
  return String(name||"ZippyPlayer").replace(/[<>]/g,"").trim().slice(0,16)||"ZippyPlayer";
}
function roomPlayers(room){
  const out={};
  for(const [id,p] of room.players) out[id]=p;
  return out;
}

io.on("connection",socket=>{
  socket.on("createRoom",(data,reply)=>{
    if(typeof reply!=="function") reply=()=>{};
    const code=makeCode();
    const player={
      id:socket.id,name:cleanName(data?.name),x:0,y:1.5,z:250,ry:0,
      color:COLORS[0]
    };
    rooms.set(code,{players:new Map([[socket.id,player]])});
    socket.join(code);
    socket.data.room=code;
    reply({ok:true,room:code});
    socket.emit("roomState",{players:roomPlayers(rooms.get(code))});
  });

  socket.on("joinRoom",(data,reply)=>{
    if(typeof reply!=="function") reply=()=>{};
    const code=String(data?.room||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
    const room=rooms.get(code);
    if(!room) return reply({ok:false,error:"Sala não encontrada."});
    if(room.players.size>=8) return reply({ok:false,error:"A sala está cheia (máximo 8)."});
    const color=COLORS[room.players.size%COLORS.length];
    const player={
      id:socket.id,name:cleanName(data?.name),x:0,y:1.5,z:250,ry:0,color
    };
    room.players.set(socket.id,player);
    socket.join(code);
    socket.data.room=code;
    reply({ok:true,room:code});
    socket.emit("roomState",{players:roomPlayers(room)});
    socket.to(code).emit("playerJoined",player);
  });

  socket.on("requestState",()=>{
    const code=socket.data.room;
    const room=rooms.get(code);
    if(room) socket.emit("roomState",{players:roomPlayers(room)});
  });

  socket.on("playerMove",data=>{
    const code=socket.data.room;
    const room=rooms.get(code);
    const p=room?.players.get(socket.id);
    if(!p || !data) return;
    const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:0));
    p.x=clamp(Number(data.x),-38,38);
    p.y=clamp(Number(data.y),1.5,80);
    p.z=clamp(Number(data.z),-1600,300);
    p.ry=clamp(Number(data.ry),-Math.PI*4,Math.PI*4);
    socket.to(code).emit("playerMoved",p);
  });

  socket.on("disconnect",()=>{
    const code=socket.data.room;
    const room=rooms.get(code);
    if(!room) return;
    room.players.delete(socket.id);
    socket.to(code).emit("playerLeft",socket.id);
    if(room.players.size===0) rooms.delete(code);
  });
});

server.listen(PORT,()=>console.log(`Zippy multiplayer server on port ${PORT}`));
