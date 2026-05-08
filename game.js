// ============================================================
//  game.js — Aventura del Corazón (mobile-fixed build)
//  FIXES APPLIED:
//   1. Nivel 1: worldHeight correctamente seteado → plataforma visible
//   2. Boss UI dibujado FUERA del ctx.save/translate → posición correcta
//   3. Límite de partículas (80) y lluvia (15) → sin lentitud
//   4. Colisión lluvia convertida a screen-space coords
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameState = {
    level: 0,
    score: 0,
    active: false,
    isLooping: false,
    cameraX: 0,
    cameraY: 0,
    hasKey: 0,
    canDoubleJump: false,
    memories: [],
    particles: [],
    parallax: [],
    worldWidth: 3000,
    worldHeight: 1200,
    bossHealth: 100,
    bossActive: false,
    keys: {}
};

const THEME = { pink: '#ff007f', blue: '#00f2ff', gold: '#f8b500' };

// ── Particle ────────────────────────────────────────────────
class Particle {
    constructor(x, y, color, size, sx, sy, life) {
        this.x = x; this.y = y; this.color = color;
        this.size = size; this.sx = sx; this.sy = sy;
        this.life = life; this.maxLife = life;
    }
    update() { this.x += this.sx; this.y += this.sy; this.life -= 0.02; }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.life / this.maxLife;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ── Player & world arrays ────────────────────────────────────
let player = {
    x: 100, y: 0, w: 50, h: 50,
    dy: 0, dx: 0,
    grounded: false, doubleJumped: false,
    trailTimer: 0, confidence: 100,
    lastS: 0
};

let platforms = [], collectibles = [], entities = [], obstacles = [];

// ── Level metadata ───────────────────────────────────────────
const levelIntros = [
    { title: "Nivel 1: El Inicio de Todo", desc: "Donde todo comenzó. Recolecta los 5 recuerdos de nuestros primeros días para abrir el camino hacia adelante." },
    { title: "Nivel 2: Creciendo Juntos", desc: "El camino se vuelve más difícil. Encuentra las 3 llaves doradas y usa el poder del doble salto para cruzar el gran vacío." },
    { title: "Nivel 3: El Desafío Final", desc: "Las dudas intentarán detenerte, pero nuestro amor es más fuerte. Usa tus disparos de corazón para vencer los temores finales." }
];

const clues = [
    ["Aquel primer mes fue el inicio de todo.", "Tu mirada iluminó mi oscuridad.", "Nuestras risas son mi motor diario.", "Eres mi lugar seguro.", "Esta aventura apenas comienza."],
    ["El camino es largo, pero vale la pena.", "Cada salto nos acerca más.", "He guardado cada detalle tuyo aquí.", "La llave del corazón está cerca.", "Juntos podemos con todo."],
    ["El final está a la vista.", "No tengas miedo de las dudas.", "Lo que siento es más fuerte que el jefe final.", "Eres mi victoria más grande.", "¡Prepárate para la gran pregunta!"]
];

// ── Canvas resize ────────────────────────────────────────────
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initStars();
}
window.addEventListener('resize', resize);
resize();

function initStars() {
    gameState.parallax = [];
    for (let i = 0; i < 300; i++) {
        gameState.parallax.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            s: Math.random() * 2,
            sp: 0.1 + Math.random() * 0.2
        });
    }
}

// ── Game start / level flow ──────────────────────────────────
function startGame() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('memory-log-btn').classList.remove('hidden');
    document.getElementById('music-toggle-btn').classList.remove('hidden');
    updateTouchControls(); // Activar controles split desde el inicio

    const music = document.getElementById('bg-music');
    music.volume = 0.5;
    music.play().catch(() => { });

    showLevelIntro(1);
}

function showLevelIntro(num) {
    gameState.active = false;
    gameState.isLooping = false; // resetear para que el próximo nivel arranque limpio
    gameState.level = num;
    const intro = levelIntros[num - 1];
    document.getElementById('intro-level-title').innerText = intro.title;
    document.getElementById('intro-level-desc').innerText = intro.desc;
    document.getElementById('level-intro-screen').classList.remove('hidden');
    document.getElementById('touch-split').classList.add('hidden'); // ocultar controles durante intro
}

function startLevelAfterIntro() {
    document.getElementById('level-intro-screen').classList.add('hidden');
    initLevel(gameState.level);
    // Para nivel 3 en móvil landscape, initLevel pone active=false y hace return.
    // Para todos los demás casos active=true y arrancamos el loop.
    updateTouchControls();
    if (gameState.active && !gameState.isLooping) {
        gameState.isLooping = true;
        requestAnimationFrame(gameLoop);
    }
}

function toggleMusic() {
    const music = document.getElementById('bg-music');
    const btn = document.getElementById('music-toggle-btn');
    if (music.paused) { music.play(); btn.innerText = '🔊'; }
    else { music.pause(); btn.innerText = '🔇'; }
}

// ── initLevel ────────────────────────────────────────────────
function initLevel(num) {
    // FIX 1: worldHeight always set before placing player
    gameState.worldHeight = canvas.height; // safe default

    player.dy = 0; player.dx = 0; player.grounded = false;
    player.confidence = 100; player.doubleJumped = false;
    platforms = []; collectibles = []; entities = []; obstacles = [];
    gameState.score = 0; gameState.hasKey = 0;
    gameState.active = true; // activo por defecto; nivel 3 en landscape lo anula
    updateHUD();

    if (num === 1) {
        // FIX 1: explicitly set worldHeight so camera math is correct on mobile
        gameState.worldWidth = 8000;
        gameState.worldHeight = canvas.height;

        player.x = 100;
        player.y = gameState.worldHeight - 300;

        platforms.push({ x: 0, y: gameState.worldHeight - 100, w: 8000, h: 100, type: 'ground' });

        for (let i = 0; i < 5; i++) {
            collectibles.push({
                x: 1500 + i * 1300 + Math.random() * 200,
                y: gameState.worldHeight - 180 - Math.random() * 50,
                type: 'memory', idx: i
            });
        }

        let lastObsX = 0;
        for (let x = 800; x < 7000; x += 200) {
            let nearMem = collectibles.some(m => Math.abs(m.x - x) < 150);
            if (nearMem) continue;
            if (Math.random() < 0.25 && (x - lastObsX > 600)) {
                obstacles.push({ x: x, y: gameState.worldHeight - 140, w: 40, h: 40 });
                lastObsX = x;
            } else if (Math.random() < 0.6) {
                collectibles.push({ x: x, y: gameState.worldHeight - 150 - Math.random() * 120, type: 'sparkle', idx: -1 });
            }
        }

    } else if (num === 2) {
        gameState.worldWidth = 5000;
        gameState.worldHeight = 3000;
        player.x = 100;
        player.y = 2800;

        platforms.push({ x: 0, y: 2900, w: 1200, h: 100 });

        let zone1Plats = [];
        // Zone 1: Floating Gardens
        zone1Plats.push({ x: 300, y: 2750, w: 250, h: 20 });
        zone1Plats.push({ x: 650, y: 2750, w: 200, h: 20 });
        zone1Plats.push({ x: 800, y: 2600, w: 400, h: 20 });
        zone1Plats.push({ x: 450, y: 2600, w: 200, h: 20 });
        zone1Plats.push({ x: 150, y: 2440, w: 220, h: 20 });
        zone1Plats.push({ x: 480, y: 2440, w: 180, h: 20 });
        zone1Plats.push({ x: 300, y: 2280, w: 450, h: 20 });
        zone1Plats.push({ x: 850, y: 2280, w: 300, h: 20 });
        zone1Plats.push({ x: 1200, y: 2120, w: 200, h: 20 });
        zone1Plats.push({ x: 950, y: 1980, w: 220, h: 20 });
        zone1Plats.push({ x: 650, y: 1840, w: 250, h: 20 });
        zone1Plats.push({ x: 300, y: 1700, w: 200, h: 20 });
        zone1Plats.push({ x: 600, y: 1700, w: 300, h: 20 });
        zone1Plats.push({ x: 1000, y: 1700, w: 200, h: 20 });
        zone1Plats.push({ x: 1300, y: 1550, w: 250, h: 20 });
        let powerupAltar = { x: 1600, y: 1450, w: 400, h: 20 };
        zone1Plats.push(powerupAltar);
        zone1Plats.forEach(p => platforms.push(p));

        let zone2Plats = [];
        // Zone 2: Sky Chasm (double jump required)
        zone2Plats.push({ x: 2100, y: 1280, w: 220, h: 20 });
        platforms.push({ x: 2000, y: 1480, w: 450, h: 20, type: 'safety_net' });

        zone2Plats.push({ x: 1800, y: 1100, w: 180, h: 20 });
        platforms.push({ x: 1700, y: 1300, w: 350, h: 20, type: 'safety_net' });

        zone2Plats.push({ x: 1450, y: 930, w: 200, h: 20 });
        platforms.push({ x: 1350, y: 1150, w: 400, h: 20, type: 'safety_net' });

        zone2Plats.push({ x: 1850, y: 780, w: 300, h: 20 });
        zone2Plats.push({ x: 2300, y: 780, w: 220, h: 20 });
        platforms.push({ x: 1750, y: 980, w: 850, h: 20, type: 'safety_net' });

        zone2Plats.push({ x: 2700, y: 600, w: 250, h: 20 });
        zone2Plats.push({ x: 3100, y: 600, w: 300, h: 20 });
        zone2Plats.push({ x: 3500, y: 430, w: 220, h: 20 });
        zone2Plats.push({ x: 3850, y: 300, w: 250, h: 20 });
        zone2Plats.push({ x: 4150, y: 180, w: 200, h: 20 });
        zone2Plats.forEach(p => platforms.push(p));

        platforms.push({ x: 4400, y: 100, w: 600, h: 20, type: 'gate' });

        // Collectibles
        collectibles.push({ x: powerupAltar.x + powerupAltar.w / 2, y: powerupAltar.y - 50, type: 'powerup' });
        collectibles.push({ x: zone2Plats[1].x + zone2Plats[1].w / 2, y: zone2Plats[1].y - 50, type: 'key' });
        collectibles.push({ x: zone2Plats[4].x + zone2Plats[4].w / 2, y: zone2Plats[4].y - 50, type: 'key' });
        collectibles.push({ x: zone2Plats[7].x + zone2Plats[7].w / 2, y: zone2Plats[7].y - 50, type: 'key' });
        collectibles.push({ x: zone1Plats[6].x + zone1Plats[6].w / 2, y: zone1Plats[6].y - 50, type: 'memory', idx: 0 });
        collectibles.push({ x: zone1Plats[9].x + zone1Plats[9].w / 2, y: zone1Plats[9].y - 50, type: 'memory', idx: 1 });
        collectibles.push({ x: zone2Plats[0].x + zone2Plats[0].w / 2, y: zone2Plats[0].y - 50, type: 'memory', idx: 2 });
        collectibles.push({ x: zone2Plats[3].x + zone2Plats[3].w / 2, y: zone2Plats[3].y - 50, type: 'memory', idx: 3 });
        collectibles.push({ x: zone2Plats[8].x + zone2Plats[8].w / 2, y: zone2Plats[8].y - 50, type: 'memory', idx: 4 });

    } else if (num === 3) {
        gameState.bossActive = true;
        gameState.bossHealth = 100;
        entities = [];

        // On mobile, level 3 needs portrait orientation (taller space)
        const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (isMobile && window.innerWidth > window.innerHeight) {
            // Still landscape → show warning and wait for rotation
            document.getElementById('vertical-warning').style.display = 'flex';
            gameState.active = false;
            return;
        }

        setupLevel3World();
    }
}

// Called once portrait is confirmed (or always on desktop)
function setupLevel3World() {
    document.getElementById('vertical-warning').style.display = 'none';

    // Re-sync canvas after possible rotation
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initStars();

    // En móvil el zoom es 0.6, así que el mundo debe ser más ancho que el canvas
    const lvl3zoom = (window.innerWidth < 1100) ? 0.6 : 1.0;
    gameState.worldWidth = canvas.width / lvl3zoom;
    gameState.worldHeight = canvas.height / lvl3zoom;

    platforms = [];
    // Plataforma cubre todo el ancho del mundo (no solo el canvas)
    platforms.push({ x: 0, y: gameState.worldHeight - 100, w: gameState.worldWidth, h: 100 });

    player.x = 100;
    player.y = gameState.worldHeight - 150; // justo encima de la plataforma (y - 100 - 50 player height)
    player.dx = 0; player.dy = 0;
    player.confidence = 100;
    player.grounded = true;  // ya parado, no cae al inicio
    player.doubleJumped = false;
    entities = [];

    updateHUD();

    gameState.active = true;
    updateTouchControls(); // mostrar split DESPUÉS de active=true
    if (!gameState.isLooping) {
        gameState.isLooping = true;
        requestAnimationFrame(gameLoop);
    }
}

// ── Game loop ────────────────────────────────────────────────
function gameLoop() {
    if (!gameState.active) {
        gameState.isLooping = false;
        return;
    }
    gameState.isLooping = true;

    // Background
    ctx.fillStyle = '#050515';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars (screen-space, no transform needed)
    ctx.fillStyle = 'white';
    for (let i = 0; i < gameState.parallax.length; i++) {
        const s = gameState.parallax[i];
        ctx.fillRect(s.x, s.y, s.s, s.s);
        s.x -= s.sp;
        if (s.x < 0) s.x = canvas.width;
    }

    const isMobile = window.innerWidth < 1100;
    const zoom = isMobile ? 0.6 : 1.0;

    let targetCamX = player.x - (canvas.width / zoom) / 2;
    let targetCamY = player.y - (canvas.height / zoom) / 2;

    if (gameState.level === 1) {
        targetCamX = player.x - (canvas.width / zoom) * 0.25;
        targetCamY = player.y - (canvas.height / zoom) * 0.66;
    } else if (gameState.level === 2) {
        targetCamY = player.y - (canvas.height / zoom) * 0.66;
    }

    gameState.cameraX += (targetCamX - gameState.cameraX) * 0.1;
    gameState.cameraY += (targetCamY - gameState.cameraY) * 0.1;

    const viewW = canvas.width / zoom;
    const viewH = canvas.height / zoom;

    gameState.cameraX = Math.max(0, Math.min(gameState.cameraX, gameState.worldWidth - viewW));
    if (gameState.worldHeight < viewH) {
        gameState.cameraY = gameState.worldHeight - viewH;
    } else {
        gameState.cameraY = Math.max(0, Math.min(gameState.cameraY, gameState.worldHeight - viewH));
    }

    // ── World-space drawing ──────────────────────────────────
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-gameState.cameraX, -gameState.cameraY);
    drawLevel();
    updatePlayer();
    updateParticles();
    ctx.restore();
    // ── End world-space ──────────────────────────────────────

    // FIX 2: Boss UI drawn in screen-space AFTER ctx.restore()
    if (gameState.level === 3) drawBossUI(zoom);

    requestAnimationFrame(gameLoop);
}

// ── drawLevel (world-space only, NO boss UI here) ────────────
function drawLevel() {
    const isMobile = window.innerWidth < 1100;

    // Platforms
    platforms.forEach(p => {
        ctx.save();
        if (!isMobile) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = p.type === 'gate' ? THEME.gold : (p.type === 'safety_net' ? THEME.pink : THEME.blue);
        }
        ctx.fillStyle = p.type === 'gate'
            ? (gameState.hasKey >= 3 ? 'rgba(248,181,0,0.8)' : 'rgba(100,100,100,0.5)')
            : (p.type === 'safety_net' ? 'rgba(255,0,127,0.45)' : 'rgba(0,242,255,0.4)');
        ctx.fillRect(p.x, p.y, p.w, p.h);
        if (p.type === 'gate') {
            ctx.fillStyle = 'white';
            ctx.font = isMobile ? '14px sans-serif' : '20px sans-serif';
            ctx.fillText(
                gameState.hasKey >= 3 ? 'PUERTA ABIERTA' : `LLAVES: ${gameState.hasKey}/3`,
                p.x + 10, p.y - 10
            );
        }
        ctx.restore();
    });

    // Level 1 specific elements
    if (gameState.level === 1) {
        const gY = gameState.worldHeight - 100;
        ctx.save();
        if (!isMobile) { ctx.shadowBlur = 20; ctx.shadowColor = THEME.blue; }
        ctx.strokeStyle = THEME.blue; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(0, gY); ctx.lineTo(gameState.worldWidth, gY); ctx.stroke();
        ctx.restore();

        ctx.save();
        if (!isMobile) { ctx.shadowBlur = 40; ctx.shadowColor = THEME.gold; }
        ctx.fillStyle = THEME.gold;
        ctx.fillRect(gameState.worldWidth - 300, gY - 400, 150, 400);
        ctx.restore();

        if (player.x > gameState.worldWidth - 500) {
            if (gameState.score < 5) {
                ctx.fillStyle = 'white';
                ctx.font = isMobile ? '14px Outfit' : '20px Outfit';
                ctx.textAlign = 'center';
                ctx.fillText('¡Faltan momentos!', player.x, player.y - 50);
            } else if (player.x > gameState.worldWidth - 300) {
                nextLevel();
            }
        }

        obstacles.forEach(o => {
            ctx.font = '40px serif';
            ctx.fillText('🌑', o.x, o.y + 35);
            if (Math.abs(player.x - o.x) < 40 && Math.abs(player.y - o.y) < 40) initLevel(1);
        });
    }

    // Collectibles
    collectibles.forEach(c => {
        ctx.save();
        if (!isMobile) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = c.type === 'memory' ? THEME.gold : (c.type === 'key' ? THEME.gold : THEME.blue);
        }
        ctx.font = '40px serif';
        let icon = '✨';
        if (c.type === 'memory') icon = '💛';
        if (c.type === 'powerup') icon = '⚡';
        if (c.type === 'key') icon = '🔑';
        if (c.type === 'sparkle') icon = '⭐';
        ctx.fillText(icon, c.x, c.y);
        ctx.restore();
    });

    // FIX 2: Rain entities drawn in world-space (they have world coords now)
    for (let i = entities.length - 1; i >= 0; i--) {
        const e = entities[i];
        if (e.type === 'rain') {
            ctx.font = '30px serif';
            ctx.fillText('💧', e.x, e.y);
            e.y += e.dy;

            if (e.y > gameState.worldHeight + 100) {
                entities.splice(i, 1);
                continue;
            }

            // Collision in world-space con invencibilidad temporal (500ms)
            const now = Date.now();
            if (!player.lastHit) player.lastHit = 0;
            if (Math.abs((player.x + 25) - e.x) < 35 && Math.abs((player.y + 25) - e.y) < 35) {
                entities.splice(i, 1);
                if (now - player.lastHit > 500) { // iframes: solo daño cada 500ms
                    player.lastHit = now;
                    player.confidence = Math.max(0, player.confidence - 5);
                    updateHUD();
                    for (let k = 0; k < 6; k++) {
                        gameState.particles.push(new Particle(e.x, e.y, '#00f2ff', 2,
                            (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.7));
                    }
                    if (player.confidence <= 0) { initLevel(3); return; }
                }
                continue;
            }
        } else if (e.type === 'heart_shot') {
            ctx.font = '30px serif';
            ctx.fillText('❤️', e.x, e.y);
            e.y -= 10;

            if (e.y < 0) { entities.splice(i, 1); continue; }

            // Hit the boss (boss is drawn at screen y≈130 → convert to world)
            const bossZoom = window.innerWidth < 1100 ? 0.6 : 1.0;
            const bossWorldY = gameState.cameraY + 130 / bossZoom;
            const bossCenterX = gameState.cameraX + canvas.width / bossZoom / 2;
            // Área de colisión ampliada: ±220px horizontal, 120px vertical
            if (gameState.bossActive && e.y < bossWorldY + 120 && e.y > gameState.cameraY &&
                Math.abs(e.x - bossCenterX) < 220) {
                gameState.bossHealth -= 5;
                entities.splice(i, 1);
                if (gameState.bossHealth <= 0) {
                    gameState.bossActive = false;
                    finishGame();
                }
                continue;
            }
        }
    }
}

// Boss UI — screen-space, calibrado para pantalla vertical portrait
function drawBossUI(zoom) {
    if (!gameState.bossActive) return;
    const cx = canvas.width / 2;
    // Barra de vida: máximo 80% del ancho de pantalla, centrada
    const barW = Math.min(canvas.width * 0.6, 280);
    const barX = cx - barW / 2;
    // Boss name y barra bajos del HUD (subidos para evitar solapamiento con la nube)
    const nameY = 90;
    const barY = nameY + 14;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px Outfit';
    ctx.shadowBlur = 8;
    ctx.shadowColor = THEME.pink;
    ctx.fillText('Dudas y Temores ☁️', cx, nameY);

    // Barra de vida
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,0,0,0.2)';
    ctx.fillRect(barX, barY, barW, 14);
    ctx.fillStyle = THEME.pink;
    ctx.fillRect(barX, barY, (gameState.bossHealth / 100) * barW, 14);
    ctx.restore();

    // Nube centrada, debajo de la barra (offset aumentado para que la nube se quede en su lugar)
    const cloudY = barY + 115;
    const isMobileCloud = window.innerWidth < 1100;
    const cloudSize = isMobileCloud ? 130 : 140; // móvil: 130px (~60% más grande), desktop: 140px
    ctx.font = `${cloudSize}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText('☁️', cx, cloudY);

    // Lluvia: spawn en world coords debajo de la nube
    const rainCount = entities.filter(e => e.type === 'rain').length;
    if (Math.random() > 0.88 && rainCount < 15) {
        const rainWorldX = gameState.cameraX + (cx / zoom) + (Math.random() - 0.5) * 140;
        const rainWorldY = gameState.cameraY + (cloudY / zoom);
        entities.push({
            x: rainWorldX,
            y: rainWorldY,
            dy: 3 + Math.random() * 3,
            type: 'rain'
        });
    }
}

// ── updatePlayer ─────────────────────────────────────────────
function updatePlayer() {
    if (gameState.keys['ArrowLeft'] || gameState.keys['KeyA']) player.dx = -8;
    else if (gameState.keys['ArrowRight'] || gameState.keys['KeyD']) player.dx = 8;
    else player.dx *= 0.8;

    player.dy += 0.8;
    player.x += player.dx;
    player.y += player.dy;

    if (player.x < 0) player.x = 0;
    if (player.x > gameState.worldWidth - 50) player.x = gameState.worldWidth - 50;

    player.grounded = false;
    platforms.forEach(p => {
        if (player.dy >= 0 &&
            player.x + 40 > p.x && player.x < p.x + p.w &&
            player.y + 50 >= p.y && player.y + 50 <= p.y + player.dy + 15) {
            if (p.type === 'gate' && gameState.hasKey < 3) {
                player.dy = -10;
            } else if (p.type === 'gate' && gameState.hasKey >= 3) {
                nextLevel();
            } else {
                player.y = p.y - 50;
                player.dy = 0;
                player.grounded = true;
                player.doubleJumped = false;
            }
        }
    });

    // Collectibles pickup
    for (let i = collectibles.length - 1; i >= 0; i--) {
        const c = collectibles[i];
        if (Math.sqrt((player.x + 25 - c.x) ** 2 + (player.y + 25 - c.y) ** 2) < 45) {
            if (c.type === 'memory') {
                gameState.memories.push(clues[gameState.level - 1][c.idx]);
                showMemory(gameState.level - 1, c.idx);
                gameState.score++;
            } else if (c.type === 'powerup') {
                gameState.canDoubleJump = true;
                document.getElementById('ability-hud').classList.remove('hidden');
            } else if (c.type === 'key') {
                gameState.hasKey++;
                updateHUD();
            }
            collectibles.splice(i, 1);
            updateHUD();
        }
    }

    // Heart shot
    if (gameState.bossActive && gameState.keys['Space']) {
        if (!player.lastS || Date.now() - player.lastS > 300) {
            entities.push({ x: player.x + 10, y: player.y, type: 'heart_shot' });
            player.lastS = Date.now();
        }
    }

    // Fall out of world → restart level (siempre usar worldHeight)
    if (player.y > gameState.worldHeight + 300) initLevel(gameState.level);

    // Draw player
    ctx.save();
    ctx.shadowBlur = 30;
    ctx.shadowColor = THEME.pink;
    ctx.font = '50px serif';
    ctx.textAlign = 'center';
    ctx.fillText('❤️', player.x + 25, player.y + 40);
    ctx.restore();

    // FIX 3: Limit trail particles to 80
    player.trailTimer++;
    if (player.trailTimer % 5 === 0 && gameState.particles.length < 80) {
        gameState.particles.push(new Particle(
            player.x + 25, player.y + 25, THEME.pink, 3,
            (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 1
        ));
    }
}

// ── Particles ────────────────────────────────────────────────
function updateParticles() {
    for (let i = gameState.particles.length - 1; i >= 0; i--) {
        const p = gameState.particles[i];
        p.update();
        p.draw();
        if (p.life <= 0) gameState.particles.splice(i, 1);
    }
}

// ── Modal / memory ───────────────────────────────────────────
function showMemory(lvl, idx) {
    gameState.active = false;
    document.getElementById('touch-split').classList.add('hidden'); // liberar botones UI
    document.getElementById('modal-text').innerText = clues[lvl][idx];
    document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    gameState.active = true;
    document.getElementById('touch-split').classList.remove('hidden'); // restaurar controles
    if (!gameState.isLooping) {
        gameState.isLooping = true;
        requestAnimationFrame(gameLoop);
    }
}

function nextLevel() {
    if (gameState.level < 3) showLevelIntro(gameState.level + 1);
    else finishGame();
}

// ── HUD ──────────────────────────────────────────────────────
function updateHUD() {
    document.getElementById('level-hud').innerText = `NIVEL ${gameState.level}`;
    const total = (gameState.level === 3) ? 'FIN' : 5;
    document.getElementById('score-hud').innerText = `RECUERDOS: ${gameState.score}/${total}`;

    const kH = document.getElementById('key-hud');
    if (gameState.level === 2) {
        kH.classList.remove('hidden');
        kH.innerText = `🔑 LLAVES: ${gameState.hasKey}/3`;
    } else {
        kH.classList.add('hidden');
    }

    const cH = document.getElementById('confidence-hud');
    if (gameState.level === 3) {
        cH.classList.remove('hidden');
        cH.innerHTML = `❤️ CONFIANZA: ${player.confidence}% <div style="display:inline-block;width:80px;height:8px;background:#222;border-radius:5px;border:1px solid rgba(255,255,255,0.2);margin-left:6px;vertical-align:middle;overflow:hidden;"><div style="width:${player.confidence}%;height:100%;background:var(--neon-pink);box-shadow:0 0 8px var(--neon-pink);"></div></div>`;

        // En nivel 3 (portrait) mover HUD a la parte inferior para no tapar el boss
        const hud = document.getElementById('hud');
        hud.style.top = 'auto';
        hud.style.bottom = '140px'; // encima de los controles táctiles
        hud.style.left = '12px';
    } else {
        cH.classList.add('hidden');
        // Restaurar HUD a posición normal
        const hud = document.getElementById('hud');
        hud.style.top = '';
        hud.style.bottom = '';
        hud.style.left = '';
    }
}

function toggleLog() {
    alert("RECUERDOS ENCONTRADOS:\n\n" + gameState.memories.join("\n\n"));
}

// ── Keyboard ─────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
    gameState.keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (player.grounded) { player.dy = -16; player.grounded = false; }
        else if (gameState.canDoubleJump && !player.doubleJumped) { player.dy = -14; player.doubleJumped = true; }
    }
});
window.addEventListener('keyup', (e) => { gameState.keys[e.code] = false; });

// ── Finish ───────────────────────────────────────────────────
function finishGame() {
    gameState.active = false;
    noScale = 1; // resetear escalas para la pantalla final
    yesScale = 1;
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('touch-controls').classList.add('hidden');
    document.getElementById('touch-split').classList.add('hidden');
    document.getElementById('memory-log-btn').classList.add('hidden');
    document.getElementById('music-toggle-btn').classList.add('hidden');
    document.getElementById('proposal-screen').classList.remove('hidden');
    typeWriter();
}

function typeWriter() {
    const txt = "Has superado las pruebas, explorado rincones profundos y vencido las dudas. Ahora, en el centro de este universo, tengo una pregunta para ti...";
    let i = 0;
    const target = document.getElementById("typing-text");
    target.innerHTML = "";
    const question = document.getElementById("proposal-question");
    question.classList.add("hidden");
    question.style.opacity = 0;

    function type() {
        if (i < txt.length) {
            target.innerHTML += txt.charAt(i++);
            setTimeout(type, 45);
        } else {
            question.classList.remove("hidden");
            question.style.transition = "opacity 1.8s ease, transform 1.8s ease";
            question.style.transform = "scale(0.95)";
            setTimeout(() => {
                question.style.opacity = 1;
                question.style.transform = "scale(1)";
                document.getElementById('yesBtn').classList.remove('hidden');
                document.getElementById('noBtn').classList.remove('hidden');
                bindNoButton(); // activar touchstart en móvil
            }, 100);
        }
    }
    type();
}

let noScale = 1;
let yesScale = 1;

function moveNo() {
    const b = document.getElementById('noBtn');
    const bYes = document.getElementById('yesBtn');

    // Acumular escala cada vez que se llama (móvil y desktop)
    noScale = Math.max(noScale * 0.80, 0.05); // mínimo 5% para que no desaparezca del todo
    yesScale = Math.min(yesScale * 1.20, 4.0);  // máximo 4x para no salirse de pantalla

    if (window.innerWidth < 1100) {
        // Móvil: encoger No y agrandar Sí
        b.style.transform = `scale(${noScale})`;
        bYes.style.transform = `scale(${yesScale})`;
        return;
    }

    // Desktop: mover No a posición aleatoria + escala
    b.style.transform = `scale(${noScale})`;
    bYes.style.transform = `scale(${yesScale})`;
    if (b.parentElement !== document.body) {
        b.style.position = 'fixed';
        b.style.zIndex = '9999';
        document.body.appendChild(b);
    }
    const margin = 80;
    const maxX = window.innerWidth - (b.offsetWidth || 100) - margin;
    const maxY = window.innerHeight - (b.offsetHeight || 50) - margin;
    b.style.left = (margin + Math.random() * (maxX - margin)) + 'px';
    b.style.top = (margin + Math.random() * (maxY - margin)) + 'px';
}

// Bindear moveNo también a touchstart para móvil (onmouseover no funciona en touch)
function bindNoButton() {
    const b = document.getElementById('noBtn');
    if (!b) return;
    b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        moveNo();
    }, { passive: false });
}

function acceptProposal() {
    confetti({ particleCount: 500, spread: 160, origin: { y: 0.6 } });
    setTimeout(() => { alert("¡Sabía que nuestro destino estaba escrito en las estrellas! ❤️"); }, 500);
}

// ── Touch controls ───────────────────────────────────────────
function fireHeart() {
    if (!player.lastS || Date.now() - player.lastS > 300) {
        entities.push({ x: player.x + 10, y: player.y, type: 'heart_shot' });
        player.lastS = Date.now();
    }
}

function handleJump() {
    if (player.grounded) { player.dy = -16; player.grounded = false; }
    else if (gameState.canDoubleJump && !player.doubleJumped) { player.dy = -14; player.doubleJumped = true; }
}

// Controles split activos para todos los niveles
function updateTouchControls() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isTouch) return;

    // Los botones clásicos ya no se usan — siempre ocultos
    document.getElementById('touch-controls').classList.add('hidden');
    // Split siempre visible durante el juego
    document.getElementById('touch-split').classList.remove('hidden');
}

function initTouch() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isTouch) return;

    // Controles clásicos ya no se usan, siempre ocultos
    document.getElementById('touch-controls').classList.add('hidden');

    // ── Controles split: activos para todos los niveles ──
    const splitLeft = document.getElementById('split-left');
    const splitRight = document.getElementById('split-right');

    // Lado IZQUIERDO: deslizar para moverse
    // Guardamos el X inicial del toque y actualizamos dx del player continuamente
    let leftTouchX = null;

    splitLeft.addEventListener('touchstart', (e) => {
        e.preventDefault();
        leftTouchX = e.touches[0].clientX;
    }, { passive: false });

    splitLeft.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (leftTouchX === null) return;
        const dx = e.touches[0].clientX - leftTouchX;
        // Zona muerta de 10px para evitar movimiento accidental
        if (dx > 10) { gameState.keys['ArrowRight'] = true; gameState.keys['ArrowLeft'] = false; }
        else if (dx < -10) { gameState.keys['ArrowLeft'] = true; gameState.keys['ArrowRight'] = false; }
        else { gameState.keys['ArrowLeft'] = false; gameState.keys['ArrowRight'] = false; }
    }, { passive: false });

    splitLeft.addEventListener('touchend', (e) => {
        e.preventDefault();
        leftTouchX = null;
        gameState.keys['ArrowLeft'] = false;
        gameState.keys['ArrowRight'] = false;
    }, { passive: false });

    // Lado DERECHO: salto siempre + disparo continuo en nivel 3
    let rightHoldInterval = null;

    splitRight.addEventListener('touchstart', (e) => {
        if (!gameState.active) return;
        e.preventDefault();
        handleJump(); // saltar al tocar
        // Si es nivel 3, también disparar y mantener disparo mientras se sostiene
        if (gameState.level === 3) {
            fireHeart();
            rightHoldInterval = setInterval(() => {
                if (gameState.active && gameState.level === 3) fireHeart();
            }, 320);
        }
    }, { passive: false });

    splitRight.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (rightHoldInterval) { clearInterval(rightHoldInterval); rightHoldInterval = null; }
    }, { passive: false });
}

initTouch();

// ── Orientation management ──────────────────────────────────
// - Niveles 1 y 2: requieren horizontal → muestra #orientation-warning en portrait
// - Nivel 3:       requiere vertical    → muestra #vertical-warning en landscape
//   body.level3 desactiva el warning horizontal vía CSS

function checkOrientation() {
    const isPortrait = window.innerHeight > window.innerWidth;
    const isLevel3 = gameState.level === 3;
    const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const hWarn = document.getElementById('orientation-warning');
    const vWarn = document.getElementById('vertical-warning');

    if (!isMobile) {
        // Desktop: ocultar ambos warnings siempre
        hWarn.style.display = 'none';
        vWarn.style.display = 'none';
        return;
    }

    if (isLevel3) {
        // Nivel 3 necesita portrait → ocultar warning horizontal, mostrar vertical si landscape
        hWarn.style.display = 'none';
        if (isPortrait) {
            vWarn.style.display = 'none';
            if (!gameState.active) setupLevel3World();
        } else {
            vWarn.style.display = 'flex';
            gameState.active = false;
        }
    } else {
        // Niveles 0, 1, 2 necesitan landscape → ocultar warning vertical, mostrar horizontal si portrait
        vWarn.style.display = 'none';
        if (isPortrait) {
            hWarn.style.display = 'flex';
            gameState.active = false;
        } else {
            hWarn.style.display = 'none';
            // Reanudar juego si se giró de vuelta a horizontal durante niveles 1/2
            if (!gameState.active && !gameState.isLooping && gameState.level > 0) {
                gameState.active = true;
                gameState.isLooping = true;
                requestAnimationFrame(gameLoop);
            }
        }
    }
}

window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 300));
window.addEventListener('resize', checkOrientation);

// Verificar orientación al cargar la página
checkOrientation();