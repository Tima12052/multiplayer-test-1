const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let bullets = [];

wss.on('connection', (ws) => {
    const id = Math.random().toString(36).substring(2, 9);
    
    // Spieler mit 100% Leben und Blickrichtung initialisieren
    players[id] = {
        x: 100,
        y: 300,
        color: `hsl(${Math.random() * 360}, 80%, 60%)`,
        health: 100,
        facing: 1 // 1 = Rechts, -1 = Links
    };

    ws.send(JSON.stringify({ type: 'init', id, players, bullets }));
    broadcast({ type: 'update', players, bullets });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // Bewegung & Richtung updaten
            if (data.type === 'move') {
                if (players[id]) {
                    players[id].x = data.x;
                    players[id].y = data.y;
                    players[id].facing = data.facing;
                    broadcast({ type: 'update', players, bullets });
                }
            }
            
            // Schuss-Logik verarbeiten
            if (data.type === 'shoot') {
                if (players[id] && players[id].health > 0) {
                    bullets.push({
                        id: Math.random().toString(36).substring(2, 5),
                        owner: id,
                        x: data.x,
                        y: data.y,
                        vx: data.dirX * 8, // Kugel-Geschwindigkeit
                        width: 10,
                        height: 6
                    });
                    broadcast({ type: 'update', players, bullets });
                }
            }

            // Manuelle Heilung/Respawn bei Tod
            if (data.type === 'respawn') {
                if (players[id]) {
                    players[id].health = 100;
                    players[id].x = 100;
                    players[id].y = 300;
                    broadcast({ type: 'update', players, bullets });
                }
            }
        } catch (e) {
            console.error(e);
        }
    });

    ws.on('close', () => {
        delete players[id];
        // Alle Kugeln des verlassenen Spielers entfernen
        bullets = bullets.filter(b => b.owner !== id);
        broadcast({ type: 'update', players, bullets });
    });
});

// Server-Seitige Physik-Schleife für Kugeln und Treffer-Kollisionen
setInterval(() => {
    if (bullets.length === 0) return;

    let hitOccurred = false;

    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;

        // Kugel entfernen, wenn sie aus dem Bildschirm fliegt
        if (b.x < 0 || b.x > 800) {
            bullets.splice(i, 1);
            hitOccurred = true;
            continue;
        }

        // Kollision zwischen Kugel und anderen Spielern prüfen
        for (let pId in players) {
            let p = players[pId];
            
            // Man kann sich nicht selbst anschießen und tote Spieler haben keine Hitbox
            if (b.owner !== pId && p.health > 0) {
                if (b.x + b.width > p.x &&
                    b.x < p.x + 30 && // Spielerbreite: 30
                    b.y + b.height > p.y &&
                    b.y < p.y + 30) { // Spielerhöhe: 30
                    
                    // Treffer! 20 Schaden abziehen
                    p.health = Math.max(0, p.health - 20);
                    bullets.splice(i, 1);
                    hitOccurred = true;
                    break;
                }
            }
        }
    }

    if (hitOccurred || bullets.length > 0) {
        broadcast({ type: 'update', players, bullets });
    }
}, 1000 / 60); // 60 FPS Server-Tickrate für Projektile

function broadcast(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
