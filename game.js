const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const lobby = document.getElementById('lobby');
const match = document.getElementById('match');
const roomCodeInput = document.getElementById('roomCode');
const lobbyMessage = document.getElementById('lobbyMessage');
const connectionStatus = document.getElementById('connectionStatus');

const GRAVITY = 0.6;
const JUMP_V = -12;
const MOVE_SPEED = 4;
const BULLET_SPEED = 13;
const BULLET_RADIUS = 4;
const PLAYER_W = 30, PLAYER_H = 46;
const MAX_HP = 100;
const BULLET_DAMAGE = 12;
const RESPAWN_DELAY = 90; // frames (~1.5s at 60fps)
const SHOOT_COOLDOWN = 12;

// Obstacles: platforms to stand on AND walls that block bullets.
const platforms = [
  { x: 0,        y: H - 40, w: W,   h: 40 },   // ground
  { x: 140,      y: 420,    w: 160, h: 20 },
  { x: W - 300,  y: 420,    w: 160, h: 20 },
  { x: 0,        y: 370,    w: 220, h: 20 },
  { x: W - 220,  y: 370,    w: 220, h: 20 },
  { x: W / 2 - 90, y: 220,  w: 180, h: 20 },
  { x: 460,      y: 150,    w: 40,  h: 290 },  // central bullet-blocking wall
];

function makePlayer(x, y, color, name) {
  return {
    x, y, vx: 0, vy: 0, w: PLAYER_W, h: PLAYER_H, color, name,
    onGround: false, facing: 1, hp: MAX_HP, alive: true,
    respawnTimer: 0, score: 0, shootCooldown: 0,
    spawnX: x, spawnY: y,
  };
}

const players = [makePlayer(100, H - 100, '#3aa1ff', 'P1'), makePlayer(W - 140, H - 100, '#ff4d4d', 'P2')];
const [p1, p2] = players;
p2.facing = -1;
let bullets = [];
const input = { left: false, right: false, jump: false, shoot: false, shootPressed: false };
const keyboardInput = { left: false, right: false, jump: false, shoot: false };
const activeButtonPointers = new Map();
const canvasShootPointers = new Set();
let remoteInput = { left: false, right: false, jump: false, shoot: false, shootPressed: false };
let peer = null;
let connection = null;
let isHost = false;
let localPlayer = 0;
let gameRunning = false;
let lastStateSent = 0;

function setStatus(label, state = '') {
  connectionStatus.dataset.state = state;
  connectionStatus.lastChild.textContent = ` ${label}`;
}

function setLobbyMessage(message) {
  lobbyMessage.textContent = message;
}

function showMatch(code) {
  lobby.hidden = true;
  match.hidden = false;
  document.getElementById('matchLabel').textContent = `ROOM  ${code}`;
}

function showLobby(message = 'Create a room or enter a friend\'s code.') {
  gameRunning = false;
  lobby.hidden = false;
  match.hidden = true;
  setStatus('Offline');
  setLobbyMessage(message);
}

function closeConnection() {
  gameRunning = false;
  if (connection) connection.close();
  if (peer) peer.destroy();
  connection = null;
  peer = null;
}

function startMatch(code) {
  showMatch(code);
  setStatus(isHost ? 'Waiting for opponent' : 'Connecting', 'waiting');
}

function startGame() {
  gameRunning = true;
  setStatus('Connected', 'connected');
  if (isHost) resetRound();
}

document.getElementById('createRoom').addEventListener('click', () => {
  if (!window.Peer) {
    setLobbyMessage('Could not load the multiplayer service. Refresh and try again.');
    return;
  }
  closeConnection();
  isHost = true;
  localPlayer = 0;
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  setLobbyMessage('Creating room...');
  peer = new Peer(code, { debug: 1 });
  peer.on('open', id => {
    roomCodeInput.value = id;
    startMatch(id);
    setLobbyMessage('Share the room code. The match starts when your opponent joins.');
  });
  peer.on('connection', conn => {
    if (connection) { conn.close(); return; }
    connection = conn;
    conn.on('open', startGame);
    conn.on('data', data => {
      if (data.type === 'input') {
        const shootPressed = remoteInput.shootPressed || data.input.shootPressed;
        remoteInput = data.input;
        remoteInput.shootPressed = shootPressed;
      }
    });
    conn.on('close', () => {
      connection = null;
      gameRunning = false;
      setStatus('Opponent left', 'waiting');
      setLobbyMessage('Your opponent disconnected. Share the room code to play again.');
    });
    conn.on('error', () => setLobbyMessage('Connection interrupted. Check both devices are online.'));
  });
  peer.on('error', error => {
    const messages = { 'unavailable-id': 'That room code is already in use. Create another room.', 'peer-unavailable': 'Room not found. Check the code and try again.' };
    closeConnection();
    showLobby(messages[error.type] || 'Could not create the room. Please try again.');
  });
});

document.getElementById('joinRoom').addEventListener('click', () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) { setLobbyMessage('Enter a room code first.'); return; }
  if (!window.Peer) { setLobbyMessage('Could not load the multiplayer service. Refresh and try again.'); return; }
  closeConnection();
  isHost = false;
  localPlayer = 1;
  setLobbyMessage('Joining room...');
  peer = new Peer({ debug: 1 });
  peer.on('open', () => {
    startMatch(code);
    connection = peer.connect(code, { reliable: true });
    connection.on('open', startGame);
    connection.on('data', data => {
      if (data.type === 'state') applyState(data.state);
    });
    connection.on('close', () => {
      gameRunning = false;
      setStatus('Opponent left', 'waiting');
      setLobbyMessage('The host disconnected. Create a new room to play again.');
    });
    connection.on('error', () => setLobbyMessage('Connection interrupted. Check both devices are online.'));
  });
  peer.on('error', error => {
    closeConnection();
    showLobby(error.type === 'peer-unavailable' ? 'Room not found. Check the code and try again.' : 'Could not join the room. Please try again.');
  });
});

document.getElementById('copyRoom').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(roomCodeInput.value);
    document.getElementById('copyRoom').textContent = 'Copied';
  } catch {
    setLobbyMessage(`Room code: ${roomCodeInput.value}`);
  }
});

document.getElementById('leaveRoom').addEventListener('click', () => {
  closeConnection();
  showLobby();
});

function syncAction(action) {
  const pointers = activeButtonPointers.get(action);
  const wasPressed = input[action];
  input[action] = keyboardInput[action] || Boolean(pointers?.size) || (action === 'shoot' && canvasShootPointers.size > 0);
  if (action === 'shoot' && input.shoot && !wasPressed) input.shootPressed = true;
}

canvas.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button === 0) {
    canvasShootPointers.add(e.pointerId);
    syncAction('shoot');
  }
});
const releaseCanvasShoot = e => {
  if (canvasShootPointers.delete(e.pointerId)) syncAction('shoot');
};
window.addEventListener('pointerup', releaseCanvasShoot);
window.addEventListener('pointercancel', releaseCanvasShoot);

const keyActions = { a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', w: 'jump', arrowup: 'jump', ' ': 'jump' };
window.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (keyActions[key]) { keyboardInput[keyActions[key]] = true; syncAction(keyActions[key]); e.preventDefault(); }
  if (key === 'r' && !e.repeat && isHost) resetRound();
});
window.addEventListener('keyup', e => {
  const action = keyActions[e.key.toLowerCase()];
  if (action) { keyboardInput[action] = false; syncAction(action); }
});
document.querySelectorAll('.touch-controls button').forEach(button => {
  const action = button.dataset.key;
  const release = e => {
    const pointers = activeButtonPointers.get(action);
    pointers?.delete(e.pointerId);
    syncAction(action);
    button.classList.toggle('is-pressed', Boolean(pointers?.size));
  };
  button.addEventListener('pointerdown', e => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    const pointers = activeButtonPointers.get(action) || new Set();
    pointers.add(e.pointerId);
    activeButtonPointers.set(action, pointers);
    syncAction(action);
    button.classList.add('is-pressed');
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function shoot(player) {
  if (!player.alive) return;
  const cx = player.x + player.w / 2;
  const cy = player.y + player.h / 2;
  bullets.push({
    x: cx, y: cy,
    vx: player.facing * BULLET_SPEED, vy: 0,
    owner: player, r: BULLET_RADIUS,
  });
}

function updatePlayerPhysics(pl) {
  if (!pl.alive) {
    pl.respawnTimer--;
    if (pl.respawnTimer <= 0) respawn(pl);
    return;
  }
  pl.vy += GRAVITY;
  const prevX = pl.x, prevY = pl.y;
  pl.x += pl.vx;
  pl.y += pl.vy;
  pl.onGround = false;

  for (const plat of platforms) {
    const box = { x: pl.x, y: pl.y, w: pl.w, h: pl.h };
    if (rectsOverlap(box, plat)) {
      const prevBox = { x: prevX, y: prevY, w: pl.w, h: pl.h };
      const wasAbove = prevBox.y + prevBox.h <= plat.y;
      const wasBelow = prevBox.y >= plat.y + plat.h;
      const wasLeft = prevBox.x + prevBox.w <= plat.x;
      const wasRight = prevBox.x >= plat.x + plat.w;
      if (wasAbove && pl.vy >= 0) {
        pl.y = plat.y - pl.h; pl.vy = 0; pl.onGround = true;
      } else if (wasBelow && pl.vy <= 0) {
        pl.y = plat.y + plat.h; pl.vy = 0;
      } else if (wasLeft) {
        pl.x = plat.x - pl.w;
      } else if (wasRight) {
        pl.x = plat.x + plat.w;
      }
    }
  }
  pl.x = Math.max(0, Math.min(W - pl.w, pl.x));
  if (pl.y > H + 100) damagePlayer(pl, MAX_HP); // fell into the void
  if (pl.shootCooldown > 0) pl.shootCooldown--;
}

function damagePlayer(pl, dmg) {
  if (!pl.alive) return;
  pl.hp -= dmg;
  if (pl.hp <= 0) {
    pl.hp = 0;
    pl.alive = false;
    pl.respawnTimer = RESPAWN_DELAY;
    const other = pl === p1 ? p2 : p1;
    other.score++;
  }
}

function respawn(pl) {
  pl.hp = MAX_HP;
  pl.alive = true;
  pl.x = pl.spawnX;
  pl.y = pl.spawnY;
  pl.vx = 0;
  pl.vy = 0;
}

function resetRound() {
  respawn(p1);
  respawn(p2);
  bullets = [];
}

function handlePlayerInput(player, controls) {
  player.vx = 0;
  if (!player.alive) return;
  if (controls.left) { player.vx = -MOVE_SPEED; player.facing = -1; }
  if (controls.right) { player.vx = MOVE_SPEED; player.facing = 1; }
  if (controls.jump && player.onGround) player.vy = JUMP_V;
  if ((controls.shoot || controls.shootPressed) && player.shootCooldown <= 0) {
    shoot(player);
    player.shootCooldown = SHOOT_COOLDOWN;
  }
  controls.shootPressed = false;
}

function updateBullets() {
  bullets = bullets.filter(b => {
    b.x += b.vx; b.y += b.vy;
    if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) return false;
    for (const plat of platforms) {
      if (b.x > plat.x && b.x < plat.x + plat.w && b.y > plat.y && b.y < plat.y + plat.h) return false;
    }
    const targets = [p1, p2].filter(pl => pl !== b.owner && pl.alive);
    for (const t of targets) {
      if (b.x > t.x && b.x < t.x + t.w && b.y > t.y && b.y < t.y + t.h) {
        damagePlayer(t, BULLET_DAMAGE);
        return false;
      }
    }
    return true;
  });
}

function drawPlayer(pl) {
  if (!pl.alive) {
    ctx.fillStyle = '#888';
    ctx.font = '13px sans-serif';
    ctx.fillText(`${pl.name} respawning…`, pl.spawnX - 12, pl.spawnY - 8);
    return;
  }
  ctx.fillStyle = pl.color;
  ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(pl.x + (pl.facing > 0 ? pl.w - 4 : 0), pl.y + 10, 4, 6);
}

function drawHPBar(x, y, hp, color) {
  ctx.fillStyle = '#333'; ctx.fillRect(x, y, 200, 10);
  ctx.fillStyle = color; ctx.fillRect(x, y, 200 * (hp / MAX_HP), 10);
  ctx.strokeStyle = '#000'; ctx.strokeRect(x, y, 200, 10);
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px sans-serif';
  ctx.fillText(`${p1.name}${localPlayer === 0 ? ' (YOU)' : ''}  HP ${p1.hp}  Score ${p1.score}`, 20, 24);
  ctx.fillText(`${p2.name}${localPlayer === 1 ? ' (YOU)' : ''}  HP ${p2.hp}  Score ${p2.score}`, W - 270, 24);
  drawHPBar(20, 32, p1.hp, '#3aa1ff');
  drawHPBar(W - 220, 32, p2.hp, '#ff4d4d');
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#3d444d';
  for (const plat of platforms) ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

  drawPlayer(p1);
  drawPlayer(p2);

  ctx.fillStyle = '#ffd23f';
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHUD();
}

function serializeState() {
  return {
    players: players.map(({ x, y, vx, vy, onGround, facing, hp, alive, respawnTimer, score, shootCooldown }) => ({ x, y, vx, vy, onGround, facing, hp, alive, respawnTimer, score, shootCooldown })),
    bullets: bullets.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, owner: b.owner === p1 ? 0 : 1, r: b.r })),
  };
}

function applyState(state) {
  state.players.forEach((snapshot, i) => Object.assign(players[i], snapshot));
  bullets = state.bullets.map(b => ({ ...b, owner: players[b.owner] }));
}

function loop(timestamp) {
  if (gameRunning) {
    if (isHost) {
      handlePlayerInput(p1, input);
      handlePlayerInput(p2, remoteInput);
      updatePlayerPhysics(p1);
      updatePlayerPhysics(p2);
      updateBullets();
      if (connection && timestamp - lastStateSent > 33) {
        connection.send({ type: 'state', state: serializeState() });
        lastStateSent = timestamp;
      }
    } else if (connection && connection.open) {
      connection.send({ type: 'input', input: { ...input } });
      input.shootPressed = false;
    }
    draw();
  }
  requestAnimationFrame(loop);
}
draw();
loop();
