// server.js — DUST_WEB Game Server (v2)
const { createServer } = require('http');
const { Server }       = require('socket.io');
const GameState        = require('./gameState');

const PORT = process.env.PORT || 3000;

const httpServer = createServer((req,res)=>{
  res.writeHead(200,{'Content-Type':'text/plain'});
  res.end('DUST_WEB Game Server v2\n');
});

const io = new Server(httpServer,{
  cors:{ origin:'*', methods:['GET','POST'] },
  transports:['websocket','polling'],
});

const rooms = new Map();
const shootCounts = new Map();

function generateCode(){
  return Math.random().toString(36).substring(2,8).toUpperCase();
}

function getRoomForPlayer(socketId){
  for(const [code,gs] of rooms.entries())
    if(gs.hasPlayer(socketId)) return {code,gs};
  return null;
}

function rateLimitShoot(socketId,max=12){
  const now=Date.now();
  let e=shootCounts.get(socketId)||{count:0,resetAt:now+1000};
  if(now>e.resetAt){e.count=0;e.resetAt=now+1000;}
  e.count++;
  shootCounts.set(socketId,e);
  return e.count<=max;
}

io.on('connection',(socket)=>{
  console.log(`[+] ${socket.id}`);

  socket.on('player:join',({username,team,action,roomCode})=>{
    username=String(username||'Player').slice(0,16);
    team=team==='T'?'T':'CT';

    if(action==='create'){
      let code;
      do{ code=generateCode(); }while(rooms.has(code));
      const gs=new GameState(code,io);
      gs.addPlayer(socket.id,{username,team});
      rooms.set(code,gs);
      socket.join(code);
      socket.data.roomCode=code;
      socket.data.isHost=true;
      socket.emit('room:created',{roomCode:code,players:gs.getLobbyPlayers()});

    } else if(action==='join'){
      const code=String(roomCode||'').toUpperCase().slice(0,6);
      const gs=rooms.get(code);
      if(!gs) return socket.emit('room:error',{message:'Room not found.'});
      if(gs.started) return socket.emit('room:error',{message:'Game already started.'});
      if(gs.playerCount()>=10) return socket.emit('room:error',{message:'Room full.'});
      gs.addPlayer(socket.id,{username,team});
      socket.join(code);
      socket.data.roomCode=code;
      socket.emit('room:joined',{roomCode:code,players:gs.getLobbyPlayers(),isHost:gs.isHost(socket.id)});
      io.to(code).emit('lobby:update',{players:gs.getLobbyPlayers()});
    }
  });

  socket.on('player:team',({team})=>{
    const r=getRoomForPlayer(socket.id);
    if(!r) return;
    r.gs.setPlayerTeam(socket.id,team);
    io.to(r.code).emit('lobby:update',{players:r.gs.getLobbyPlayers()});
  });

  socket.on('player:ready',({ready})=>{
    const r=getRoomForPlayer(socket.id);
    if(!r) return;
    r.gs.setPlayerReady(socket.id,!!ready);
    io.to(r.code).emit('lobby:update',{players:r.gs.getLobbyPlayers()});
  });

  socket.on('game:start',()=>{
    const r=getRoomForPlayer(socket.id);
    if(!r||!r.gs.isHost(socket.id)||r.gs.playerCount()<1) return;
    r.gs.startGame();
  });

  socket.on('player:move',(data)=>{
    const r=getRoomForPlayer(socket.id);
    if(!r||!r.gs.started) return;
    r.gs.updatePlayerPosition(socket.id,data);
  });

  socket.on('player:shoot',(data)=>{
    if(!rateLimitShoot(socket.id)) return;
    const r=getRoomForPlayer(socket.id);
    if(!r||!r.gs.started) return;
    r.gs.processShot(socket.id,data,io,r.code);
  });

  socket.on('player:buy',({weaponId})=>{
    const r=getRoomForPlayer(socket.id);
    if(!r||!r.gs.started) return;
    r.gs.processBuy(socket.id,weaponId);
  });

  socket.on('disconnect',()=>{
    console.log(`[-] ${socket.id}`);
    shootCounts.delete(socket.id);
    const r=getRoomForPlayer(socket.id);
    if(!r) return;
    const wasHost=socket.data.isHost;
    r.gs.removePlayer(socket.id);
    if(r.gs.playerCount()===0){ r.gs.destroy(); rooms.delete(r.code); return; }
    io.to(r.code).emit('lobby:update',{players:r.gs.getLobbyPlayers()});
    if(wasHost){
      const newHost=r.gs.getFirstPlayer();
      if(newHost){ r.gs.setHost(newHost); io.to(newHost).emit('lobby:hostChanged'); }
    }
  });
});

httpServer.listen(PORT,()=>console.log(`DUST_WEB server on port ${PORT}`));
