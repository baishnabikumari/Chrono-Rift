const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const TILE_SIZE = 40;
const CORNER_RADIUS = 5;

const spikeImg = new Image();
spikeImg.src = 'assets/dontTouch.png';

const goalImg = new Image();
goalImg.src = 'assets/goal.png';

const playerImg = new Image();
playerImg.src = 'assets/Ball1.png';

const deathSound = new Audio('assets/LostInTime.mp3');
deathSound.volume = 1;

// game physics
const GRAVITY = 0.55;
const ACCEL = 2;
const FRICTION = 0.82;
const MAX_SPEED = 7;
const JUMP_FORCE = -13.5;

const COLORS = {
    pastBg: '#1e293b',
    pastPlat: '#3b82f6',
    pastBorder: '#60a5fa',
    presentBg: '#3a1a20',
    presentPlat: '#f25349',
    presentBorder: '#ff8a80',
    player: '#ffffff',
    playerGhost: 'rgba(255,255,255,0.4)',
    lever: '#fbbf24',
    leverActive: '#4ade80',
    spike: '#ff0000',
    goal: '#10b981',
    laserOff: '#550011',
    button: '#00ffff',
    buttonActive: '#008888',
}

let animationId;
let currentLevelIdx = 0;
let maxUnlockedLevel = parseInt(localStorage.getItem('chrono_unlocked')) || 0;
let gameOver = false;
let victoryMode = 0;
let rippleEvents = [];
let cameraX = 0;
let levelWidth = 0;
let lesersActive = true;
let laserTimer = 0;
let isBurned = false;

//input
let keys = { right: false, left: false, up: false };

window.toggleUI = function (elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        if (elementId === 'levelsOverlay' && el.classList.contains('hidden')) {
            updateLevelMenu();
        }
        el.classList.toggle('hidden');
    }
};

window.nextLevel = function () {
    if (currentLevelIdx < LEVELS.length - 1) {
        currentLevelIdx++;
        resetGame();
    } else {
        resetGame();
    }
}

function updateLevelMenu() {
    const grid = document.getElementById('levelGrid');
    if (!grid) return;
    grid.innerHTML = '';

    LEVELS.forEach((_, idx) => {
        const btn = document.createElement('div');
        btn.className = 'level-btn';
        btn.innerText = idx + 1;

        if (idx > maxUnlockedLevel) {
            btn.classList.add('locked');
            btn.innerHTML = '🔒';
        } else {
            btn.onclick = () => {
                currentLevelIdx = idx;
                resetGame();
                toggleUI('levelsOverlay');
            };
        }
        grid.appendChild(btn);
    });
}

function resizeCanvas() {
    const wrapper = document.querySelector('.game-wrapper');
    if (wrapper) {
        canvas.width = wrapper.clientWidth;
        canvas.Height = wrapper.clientHeight;
        if (!animationId) draw();
    }
}
window.addEventListener('resize', resizeCanvas);

window.addEventListener('keydown', (e) => {
    const overlays = ['instructionOverlay', 'featuresOverlay', 'levelsOverlay', 'gameEndOverlay'];
    for (let id of overlays) {
        let el = document.getElementById(id);
        if (el && !el.classList.contains('hidden') && id !== 'gameEndOverlay') return;
    }
    if (gameOver || victoryMode) return;
    if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = true;
    if (['ArrowLeft', 'keyA'].includes(e.code)) keys.left = false;
    if (['ArrowUp', 'Space', 'keyW'].includes(e.code)) keys.up = false;
});

function drawBlock(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
    } else {
        ctx.rect(x, y, w, h);
    }
    ctx.fill();
    ctx.stroke();
}

class player {
    constructor() {
        this.w = 36;
        this.h = 36;
        this.drawSize = 44;
        this.angle = 0;
        this.reset();
    }
    reset() {
        this.x = 50;
        this.y = 200;
        this.vx = 0;
        this.vy = 0;
        this.angle = 0;
        this.grounded = false;
        this.dead = false;
        isBurned = false;
    }
    update() {
        if (this.dead) return;

        if (victoryMode) {
            this.vx *= 0.9;
            this.vy += GRAVITY;
            this.y += this.vy;
            handleCollisions(this, 'y');
            this.angle += 0.2;
            if (this.grounded && Math.abs(this.vy) < 1) {
                this.vy = -8;
                this.grounded = false;
            }
            return;
        }
        if (keys.right) this.vx += ACCEL;
        if (keys.left) this.vx -= ACCEL;
        this.vx *= FRICTION;

        if (Math.abs(this.vx) > MAX_SPEED) this.vx = (this.vx > 0 ? 1 : -1) * MAX_SPEED;
        if (Math.abs(this.vx) < 0.1) this.vx = 0;
        this.x += this.vx;
        handleCollisions(this, 'x');
        this.angle += (this.vx * 0.15);

        if (this.x < 0) {
            this.x = 0;
            this.vx = 0;
        }
        if (this.x > levelWidth - this.w) {
            this.x = levelWidth - this.w;
            this.vx = 0;
        }

        this.vy += GRAVITY;
        this.y += this.vy;
        this.grounded = false;

        handleCollisions(this, 'y');

        if (checkHazardCollision(this)) triggerDeathSequence(false);
        if (checkHazardCollision(this)) triggerDeathSequence(true);
        if (this.y > canvas.Height + 600) triggerDeathSequence(false);
        if (checkGoalCollision(this)) triggerVictorySequence();

        checkButtonCollision(this);
    }
    jump() {
        if (this.grounded) {
            this.vy = JUMP_FORCE;
            this.grounded = false;
        }
    }
}

function handleCollisions(p, axis) {
    let allPlats = [...pastPlatforms, ...presentPlatforms];
    let hitbox = { x: p.x + 2, y: p.y, w: p.w - 4, h: p.h };

    for (let plat of allPlats) {
        if (rectIntersect(hitbox.x, hitbox.y, hitbox.w, hitbox.h, plat.x, plat.y, plat.w, plat.h)) {
            if (axis === 'x') {
                if (p.vx > 0) p.x = plat.x - p.w;
                else if (p.vx < 0) p.x = plat.x + plat.w;
                p.vx = 0;
            }
            else if (axis === 'y') {
                if (p.vy > 0) {
                    p.y = plat.y - p.h;
                    p.grounded = true;
                    p.vy = 0;
                }
                else if (p.vy < 0) {
                    p.y = plat.y + plat.h;
                    p.vy = 0;
                }
            }
        }
    }
}

class Lever {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = TILE_SIZE;
        this.h = TILE_SIZE;
        this.active = false;
    }
    draw(ctx, renderX) {
        if (renderX < -50 || renderX > canvas.width / 2 + 50) return;
        ctx.fillStyle = this.active ? COLORS.leverActive : COLORS.lever;
        ctx.fillRect(renderX, this.y + 10, this.w, this.h - 10);
        ctx.fillStyle = '#fff';
        const handleX = this.active ? this.w - 10 : 5;
        ctx.fillRect(renderX + handleX, this.y, 10, 20);
        if (!this.active) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px "Gagalin", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("E", renderX + this.w / 2, this.y - 15);
        }
    }
}
class Spike {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = TILE_SIZE;
        this.h = TILE_SIZE;
    }
    draw(ctx, renderX) {
        if (renderX < -50 || renderX > canvas.width / 2 + 50) return;
        const floatY = Math.sin(Date.now() / 200) * 3;
        ctx.save();
        ctx.filter = 'brightness(1.5) drop-shadow(0 0 5px rgba(255,0,0,0.6))';
        if (spikeImg.complete && spikeImg.naturalWidth !== 0) ctx.drawImage(spikeImg, renderX, this.y + floatY, this.w, this.h);
        else { ctx.fillStyle = COLORS.spike; ctx.fillRect(renderX, this.y + floatY, this.w, this.h); }
        ctx.restore();
    }
    drawGhost(ctx, renderX) {
        if (renderX < -50 || renderX > canvas.width / 2 + 50) return;
        const floatY = Math.sin(Date.now() / 200) * 3;
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.filter = 'brightness(1.2)';
        if (spikeImg.complete && spikeImg.naturalWidth !== 0) ctx, drawImage(spikeImg, renderX, this.y + floatY, this.w, this.h);
        else {
            ctx.fillStyle = 'rgba(255,0,0,0.3)';
            ctx.fillRect(renderX, this.y + floatY, this.w, this.h);
        }
        ctx.restore();
    }
}
class Laser {
    constructor(x, y){
        this.x = x;
        this.y = y;
        this.w = 10;
        this.h = TILE_SIZE * 3;
    }
    draw(ctx, renderX){
        if(renderX < -50 || renderX > canvas.width/2 + 50) return;
        ctx.save();
        if(lasersActive){
            ctx.fillStyle = COLORS.laser;
            ctx.shadowColor = COLORS.laser;
            ctx.shadowBlur = 20;
            const pulse = Math.sin(Date.now() / 100) * 2;
            ctx.fillRect(renderX + (TILE_SIZE/2 - 5) - pulse/2, this.y, this.w + pulse, this.h);
        } else {
            ctx.fillStyle = COLORS.laserOff;
            ctx.fillRect(renderX + (TILE_SIZE/2 - 2), this.y, 4, this.h);
        }
        ctx.restore();
    }
}
class TimeButton{
    constructor(x, y){
        this.x = x;
        this.y = y + 30;
        this.w = TILE_SIZE;
        this.h = 10;
        this.pressed = false;
    }
    draw(ctx, renderX){
        if(renderX < -50 || renderX > canvas.width/2 + 50) return;
        ctx.fillStyle = this.pressed ? COLORS.buttonActive : COLORS.button;
        ctx.fillRect(renderX, this.y, this.w, this.h);
        if(!this.pressed){
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.fillRect(renderX + 5, this.y - 5, this.w - 10, 5);
        }
    }
}

const LEVEL_1 = [
    "................................................................................................................",
    "................................................................................................................",
    "................................................................................................................",
    "................................................................................................................",
    "........................................^.........................L.............................................",
    "...................................3333333333....................333............................................",
    "...........................^.......3333333333......^.............333............................................",
    "S..........................3333....3333333333.....333.....^......333.........................................G..",
    "333333333333333333333......3333....3333333333.....333....333.....333.......................333333333333333333333",
    "...........................3333....3333333333.....333....333.....333.......................333333333333333333333",
    "333333333333333333333......3333....3333333333.....333....333.....333.............................................",
    "333333333333333333333......3333....3333333333.....333....333.....333.......................3333333333333333333333"
];

const LEVEL_2 = [
    "................................................................................................................",
    "................................................................................................................",
    ".................................................33333333.......................................................",
    ".................................................3..|...3.......................................................",
    "..........................B.........................|........................|..................................",
    "........................3333333..................33333333....................|..................................",
    "..........................................33.....33333333..................3333333...............................",
    "..............33........3333333..................33333333...............3........3..............................G",
    "S.......................3333333.........33.......33333333...............33......33............................333",
    "3333333333333...........3333333.......3.....3...........................3333333333.............33............3333",
    "3333333333333...........3333333.......3333333....33333333...............3333333333.............333333333333333333"
];

const LEVEL_3 = [
    "................................................................................................................",
    "................................................................................................................",
    ".....................................................3........................3.................................",
    "......................................L.............3..............B............................................",
    "...............333333333...........|..33..|........3............33333........33...3.3...........................",
    "...............3...................|..33..|......33..........33.333333........3.................................",
    "...............3......33.......3333333333333333.................333333........3.................................",
    "...............3...3...........3333333333333333.................333333........3.................................",
    "S.....................3........3333333333333333.................333333....................333............|...G..",
    "333333333333.......3333........3333333333333333.................333333...........................333333333333333",
    "333333333333...................3333333333333333.................333333...........................333333333333333"
];

const LEVELS = [LEVEL_1, LEVEL_2, LEVEL_3];
const player = new player();
const lever = new Lever(0, 0);
let pastPlatforms = [];
let presentPlatforms = [];
let spikes = [];
let lasers = [];
let buttons = [];
let goalRect = { x: 0, y: 0, w: 40, h: 40};

function buildLevel(){
    pastPlatforms = [];
    presentPlatforms = [];
    spikes = [];
    lasers = [];
    buttons = [];
    lasersActive = true;

    if(currentLevelIdx >= LEVELS.length) currentLevelIdx = 0;
    const map = LEVELS[currentLevelIdx];

    const badge = document.querySelector('.level-badge');
    if(badge) badge.innerText = "LEVEL" + (currentLevelIdx + 1).toString().padStart(2, '0');

    const rows = map.length;
    const cols = map[0].length;
    levelWidth = cols * TILE_SIZE;

    const startY = canvas.height - (rows * TILE_SIZE) - 40;
    const startX = 50;

    for(let r = 0; r < rows; r++){
        for(let c = 0; c < cols; c++){
            let char = map[r][c];
            let px = startX + c * TILE_SIZE;
            let py = startY + r * TILE_SIZE;

            if (char === '1') pastPlatforms.push({x: px, y: py, w: TILE_SIZE, h: TILE_SIZE});
            if (char === '2') presentPlatforms.push({x: px, y: py, w: TILE_SIZE, h: TILE_SIZE});
            if (char === '3'){
                pastPlatforms.push({x: px, y: py, w: TILE_SIZE, h: TILE_SIZE});
                presentPlatforms.push({x: px, y: py, w: TILE_SIZE, h: TILE_SIZE});
            }
            if (char === 'S') {
                player.x = px;
                player.y = py - 50;
            }
            if(char === 'L'){
                lever.x = px;
                lever.y = py + TILE_SIZE;
                pastPlatforms.push({x: px, y: py + TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE});
            }
            if (char === '^') {
                spikes.push(new Spike(px, py));
                presentPlatforms.push({x: px, y: py + TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE});
            }
            if(char === 'G') goalRect = {x: px, y: py, w: 40, h: 40};
            if(char === '|'){
                lasers.push(new Laser(px, py - TILE_SIZE * 2));
                presentPlatforms.push({x: py, y: py + TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE});
            }
            if(char === 'B'){
                buttons.push(new TimeButton(px, py + TILE_SIZE - 10));
                pastPlatforms.push({x: px, y: py + TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE});
            }
        }
    }
}

//logic
function checkHazardCollision(p){
    const pHitbox = {x: p.x + 4, y: p.y + 4, w: p.w - 8, h: p.h - 8};
    for (let s of spikes){
        const sHitbox = { x: s.x + 8, y: s.y + 8, w: s.w - 16, h: s.h - 8};
        if(rectIntersect(pHitbox.x, pHitbox.y, pHitbox.w, pHitbox.h, sHitbox.x, sHitbox.y, sHitbox.w, sHitbox.h)) return true;
    }
    return false;
}

function checkLaserCollision(p){
    if(!lasersActive) return false;
    const pHitbox = {x: p.x + 8, y: p.y + 8, w: p.w - 16, h: p.h - 16};
    for(let l of lasers){
        const lHitbox = {x: l.x + TILE_SIZE/2 - 5, y: l.y, w: 10, h: l.h};
        if(rectIntersect(pHitbox.x, pHitbox.y, pHitbox.w, pHitbox.h, lHitbox.x, lHitbox.y, lHitbox.w, lHitbox.h)) return true;
    }
    return false;
}

function checkButtonCollision(p){
    const footX = p.x + p.w / 2;
    const footY = p.y + p.h;

    for(let b of buttons){
        if(!b.pressed && footX > b.x && footX < b.x + b.w && Math.abs(footY - b.y) < 10){
            b.pressed = true;
            lasersActive = false;
            laserTimer = 300;
        }
    }
}

function checkGoalCollision(p){
    return rectIntersect(p.x, p.y, p.w, p.h, goalRect.x, goalRect.y, goalRect.w, goalRect.h);
}

function rectIntersect(x1,y1,w1,h1,x2,y2,w2,h2){
    return x2 < x1 + w1 && x2 + w2 > x1 && y2 < y1 + h1 && y2 + h2 > y1;
}

function attemptInteract(){
    const dist = Math.hypot(player.x - lever.x, player.y - lever.y);
    if(dist < 80 && !lever.active){
        lever.active = true;
        rippleEvents.push({
            timer: 45,
            execute: () => {
                const bridgeY = lever.y + TILE_SIZE;
                const bridgeStartX = lever.x + 150;
                for(let i=0; i<30; i++){
                    presentPlatforms.push({x: bridgeStartX + (i * TILE_SIZE), y: bridgeY, w: TILE_SIZE, h: TILE_SIZE});
                }
            }
        });
    }
}

function triggerDeathSequence(burned){
    if(gameOver) return;
    gameOver = true;
    player.dead = true;
    deathShake = 20;
    isBurned = burned;
    deathSound.currentTime = 0;
    deathSound.play().catch(e => console.log("Sound error:", e));

    setTimeout(() => {
        showOverlay(false);
    }, 500);
}

function triggerVictorySequence(){
    if(gameOver || victoryMode) return;
    victoryMode = true;

    if(currentLevelIdx === maxUnlockedLevel && currentLevelIdx < LEVELS.length - 1){
        maxUnlockedLevel++;
        localStorage.setItem('chrono_unlocked', maxUnlockedLevel);
    }
    setTimeout(() => {
        gameOver = true;
        showOverlay(true);
    }, 1500);
}

function showOverlay(win){
    const overlay = document.getElementById('gameEndOverlay');
    overlay.style.backgroundColor = "rgba(0,0,0,0.7)";
    const title = document.getElementById('endTitle');
    const nextBtn = document.getElementById('nextLevelBtn');
    const retryBtn = document.getElementById('retryBtn');

    overlay.classList.remove('hidden');

    if(win){
        title.innerText = "LEVEL CLEARED!";
        title.style.color = '#4ade80';

        if(currentLevelIdx < LEVELS.length - 1){
            nextBtn.style.display = 'block';
            retryBtn.style.display = 'none';
        } else {
            nextBtn.style.display = 'none';
            retryBtn.innerText = "PLAY AGAIN";
            retryBtn.style.display = 'block';
            title.innerText = "ALL LEVELS COMPLETED!"
        }
    } else {
        title.innerText = "LOST IN TIME";
        title.style.color = '#f25349';
        nextBtn.style.display = 'none';
        retryBtn.innerText = "TRY AGAIN";
        retryBtn.style.display = 'block';
    }
}

function draw(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const viewWidth = canvas.width / 2;
    let pCenterX = (player.x || 0) + (player.w || 30)/2;
    let targetCamX = pCenterX - viewWidth / 2;
    const maxCamX = Math.max(0, levelWidth - viewWidth + 100);
    cameraX = Math.max(0, Math.min(targetCamX, maxCamX));
}
