// Platformer Gun Fighter — Normal Mode
// Local 2-player, same-keyboard multiplayer. Pure client-side JS/Canvas,
// so it works as a static site (e.g. GitHub Pages) with no server needed.

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

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
  { x: 0,        y: 300,    w: 220, h: 20 },
  { x: W - 220,  y: 300,    w: 220, h: 20 },
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

const p1 = makePlayer(100, H - 100, '#3aa1ff', 'P1');
const p2 = makePlayer(W - 140, H - 100, '#ff4d4d', 'P2');

let bullets = [];
const keys = {};
let mouse = { x: W / 2, y: H / 2 };

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (!e.repeat && k === 'r') resetRound();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (W / r.width);
  mouse.y = (e.clientY - r.top) * (H / r.height);
});
canvas.addEventListener('mousedown', e => {
  if (e.button === 0 && p1.shootCooldown <= 0) {
    shoot(p1, mouse.x, mouse.y);
    p1.shootCooldown = SHOOT_COOLDOWN;
  }
});

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function shoot(player, tx, ty) {
  if (!player.alive) return;
  const cx = player.x + player.w / 2;
  const cy = player.y + player.h / 2;
  const dx = tx - cx, dy = ty - cy;
  const len = Math.hypot(dx, dy) || 1;
  bullets.push({
    x: cx, y: cy,
    vx: (dx / len) * BULLET_SPEED, vy: (dy / len) * BULLET_SPEED,
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

function handleInput() {
  p1.vx = 0;
  if (p1.alive) {
    if (keys['a']) { p1.vx = -MOVE_SPEED; p1.facing = -1; }
    if (keys['d']) { p1.vx = MOVE_SPEED; p1.facing = 1; }
    if (keys['w'] && p1.onGround) p1.vy = JUMP_V;
  }

  p2.vx = 0;
  if (p2.alive) {
    if (keys['arrowleft']) { p2.vx = -MOVE_SPEED; p2.facing = -1; }
    if (keys['arrowright']) { p2.vx = MOVE_SPEED; p2.facing = 1; }
    if (keys['arrowup'] && p2.onGround) p2.vy = JUMP_V;
    if (keys['l'] && p2.shootCooldown <= 0) {
      const cx = p2.x + p2.w / 2, cy = p2.y + p2.h / 2;
      shoot(p2, cx + p2.facing * 300, cy);
      p2.shootCooldown = SHOOT_COOLDOWN;
    }
  }
  if (p2.shootCooldown > 0) p2.shootCooldown--;
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
  ctx.fillText(`${p1.name}  HP ${p1.hp}  Score ${p1.score}`, 20, 24);
  ctx.fillText(`${p2.name}  HP ${p2.hp}  Score ${p2.score}`, W - 210, 24);
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

  ctx.strokeStyle = '#ffffffaa';
  ctx.beginPath();
  ctx.moveTo(mouse.x - 8, mouse.y); ctx.lineTo(mouse.x + 8, mouse.y);
  ctx.moveTo(mouse.x, mouse.y - 8); ctx.lineTo(mouse.x, mouse.y + 8);
  ctx.stroke();

  drawHUD();
}

function loop() {
  handleInput();
  updatePlayerPhysics(p1);
  updatePlayerPhysics(p2);
  updateBullets();
  draw();
  requestAnimationFrame(loop);
}
loop();
