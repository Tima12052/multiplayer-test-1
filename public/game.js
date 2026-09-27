const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${window.location.host}`);

let myId = null;
let allPlayers = {};
let allBullets = [];

const PLAYER_SIZE = 30;
const GRAVITY = 0.5;
const JUMP_FORCE = -12;
const SPEED = 5;

let localPlayer = {
    x: 100,
    y: 300,
    vx: 0,
    vy: 0,
    grounded: false,
    facing: 1, // 1 = rechts, -1 = links
    health: 100,
    canShoot: true
};

const platforms = [
    { x: 0, y: 460, width: 800, height: 40 },
    { x: 150, y: 350, width: 150, height: 20 },
    { x: 450, y: 300, width: 200, height: 20 },
    { x: 300, y: 200, width: 150, height: 20 }
];

const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    
    // Einzelschuss-Aktivierung (Verhindert Dauerfeuer durch Gedrückthalten)
    if ((e.code === 'KeyF' || e.code === 'Enter') && localPlayer.canShoot && localPlayer.health > 0) {
        shootBullet();
        localPlayer.canShoot = false;
    }

    // Respawn-Taste, wenn man tot ist
    if (e.code === 'KeyR' && localPlayer.health <= 0) {
        ws.send(JSON.stringify({ type: 'respawn' }));
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'KeyF' || e.code === 'Enter') {
        localPlayer.canShoot = true;
    }
});

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'init') {
        myId = data.id;
        allPlayers = data.players;
        allBullets = data.bullets || [];
        localPlayer.x = allPlayers[myId].x;
        localPlayer.y = allPlayers[myId].y;
        localPlayer.health = allPlayers[myId].health;
    } else if (data.type === 'update') {
        allPlayers = data.players;
        allBullets = data.bullets || [];
        if (myId && allPlayers[myId]) {
            localPlayer.health = allPlayers[myId].health;
        }
    }
};

function shootBullet() {
    if (ws.readyState === WebSocket.OPEN && myId) {
        // Kugel startet mittig vor der Spielfigur
        let bulletX = localPlayer.facing === 1 ? localPlayer.x + PLAYER_SIZE : localPlayer.x - 10;
        let bulletY = localPlayer.y + (PLAYER_SIZE / 2) - 3;
        
        ws.send(JSON.stringify({
            type: 'shoot',
            x: bulletX,
            y: bulletY,
            dirX: localPlayer.facing
        }));
    }
}

function update() {
    // Wenn tot, keine Bewegung erlauben
    if (localPlayer.health <= 0) {
        localPlayer.vx = 0;
        return;
    }

    // Bewegung links/rechts & Richtungs-Erkennung
    if (keys['KeyA'] || keys['ArrowLeft']) {
        localPlayer.vx = -SPEED;
        localPlayer.facing = -1;
    } else if (keys['KeyD'] || keys['ArrowRight']) {
        localPlayer.vx = SPEED;
        localPlayer.facing = 1;
    } else {
        localPlayer.vx = 0;
    }

    // Springen
    if ((keys['KeyW'] || keys['Space'] || keys['ArrowUp']) && localPlayer.grounded) {
        localPlayer.vy = JUMP_FORCE;
        localPlayer.grounded = false;
    }

    localPlayer.vy += GRAVITY;
    localPlayer.x += localPlayer.vx;
    localPlayer.y += localPlayer.vy;

    if (localPlayer.x < 0) localPlayer.x = 0;
    if (localPlayer.x > canvas.width - PLAYER_SIZE) localPlayer.x = canvas.width - PLAYER_SIZE;

    // Plattform-Kollisionsprüfung
    localPlayer.grounded = false;
    for (let plat of platforms) {
        if (localPlayer.x + PLAYER_SIZE > plat.x &&
            localPlayer.x < plat.x + plat.width &&
            localPlayer.y + PLAYER_SIZE >= plat.y &&
            localPlayer.y + PLAYER_SIZE - localPlayer.vy <= plat.y) {
            
            localPlayer.y = plat.y - PLAYER_SIZE;
            localPlayer.vy = 0;
            localPlayer.grounded = true;
        }
    }

    // Loch-Absturz (Zieht Leben ab und setzt zurück)
    if (localPlayer.y > canvas.height) {
        localPlayer.x = 100;
        localPlayer.y = 300;
        localPlayer.vy = 0;
        if (ws.readyState === WebSocket.OPEN && myId) {
            ws.send(JSON.stringify({ type: 'move', x: localPlayer.x, y: localPlayer.y, facing: localPlayer.facing }));
        }
        return;
    }

    // Position an den Server senden
    if (ws.readyState === WebSocket.OPEN && myId) {
        ws.send(JSON.stringify({
            type: 'move',
            x: localPlayer.x,
            y: localPlayer.y,
            facing: localPlayer.facing
        }));
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Plattformen
    ctx.fillStyle = '#7f8c8d';
    for (let plat of platforms) {
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
    }

    // Kugeln zeichnen
    ctx.fillStyle = '#f1c40f'; // Gelbe Laser-Projektile
    for (let b of allBullets) {
        ctx.fillRect(b.x, b.y, b.width, b.height);
    }

    // Spieler zeichnen
    for (let id in allPlayers) {
        let p = allPlayers[id];
        
        // Wenn tot, zeichne den Spieler nicht (oder ausgegraut)
        if (p.health <= 0) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            let x = (id === myId) ? localPlayer.x : p.x;
            let y = (id === myId) ? localPlayer.y : p.y;
            ctx.fillRect(x, y, PLAYER_SIZE, PLAYER_SIZE);
            ctx.strokeRect(x, y, PLAYER_SIZE, PLAYER_SIZE);
            
            if (id === myId) {
                ctx.fillStyle = '#ffffff';
                ctx.font = '14px sans-serif';
                ctx.fillText("TOT! Drücke R zum Respawn", x - 40, y - 25);
            }
            continue;
        }
        
        let x = (id === myId) ? localPlayer.x : p.x;
        let y = (id === myId) ? localPlayer.y : p.y;
        let facing = (id === myId) ? localPlayer.facing : p.facing;

        // Spieler-Körper
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, PLAYER_SIZE, PLAYER_SIZE);

        // Visuelles Auge/Visier basierend auf Blickrichtung zeichnen
        ctx.fillStyle = '#ffffff';
        if (facing === 1) {
            ctx.fillRect(x + 20, y + 6, 6, 6); // Schaut nach rechts
        } else {
            ctx.fillRect(x + 4, y + 6, 6, 6);  // Schaut nach links
        }

        // Weißer Rahmen um den eigenen Charakter
        if (id === myId) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, PLAYER_SIZE, PLAYER_SIZE);
        }

        // --- LEBENSBALKEN ZEICHNEN ---
        const barWidth = 40;
        const barHeight = 6;
        const barX = x - (barWidth - PLAYER_SIZE) / 2;
        const barY = y - 12;

        // Roter Hintergrund (Fehlendes Leben)
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Grüner Balken (Aktuelles Leben)
        ctx.fillStyle = '#2ecc71';
        const currentLifeWidth = (p.health / 100) * barWidth;
        ctx.fillRect(barX, barY, currentLifeWidth, barHeight);
    }
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();
