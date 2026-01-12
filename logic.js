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
deathSound.volume = 0.5;
const jumpSound = new Audio('assets/jump.mp3');
jumpSound.volume = 0.3;
const winSound = new Audio('assets/wingame.mp3');
winSound.volume = 0.5;

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
    laser: '#ff0000',
    laserCore: '#550000',
    laserOff: '#220000',
    button: '#00ffff',
    buttonActive: '#008888',
}

let animationId;
let currentLevelIdx = 0;
let maxUnlockedLevel = parseInt(localStorage.getItem('chrono_unlocked')) || 0;
let gameOver = false;
let victoryMode = false;
let gameStarted = false;
let deathShake = 0;
let rippleEvents = [];
let cameraX = 0;
let levelWidth = 0;
let lasersActive = true;
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

window.startGame = function(){
    gameStarted = true;
    document.getElementById('startScreen').classList.add('hidden');
    resetGame();
}

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
                startGame();
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
        canvas.height = wrapper.clientHeight;
        if (!animationId) draw();
    }
}
window.addEventListener('resize', resizeCanvas);

window.addEventListener('keydown', (e) => {

    if(!gameStarted) return;
    const overlays = ['instructionOverlay', 'featuresOverlay', 'levelsOverlay', 'gameEndOverlay'];
    for (let id of overlays) {
        let el = document.getElementById(id);
        if (el && !el.classList.contains('hidden') && id !== 'gameEndOverlay') return;
    }
    if (gameOver || victoryMode) return;
    if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = true;
    if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = true;
    if (['ArrowUp', 'Space', 'KeyW'].includes(e.code)){
        if(!keys.up && player.grounded) player.jump();
        keys.up = true;
    }
    if(e.code === 'KeyE') attemptInteract();
});
window.addEventListener('keyup', (e) => {
    if(['ArrowRight', 'KeyD'].includes(e.code)) keys.right = false;
    if(['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = false;
    if(['ArrowUp', 'Space', 'KeyW'].includes(e.code)) keys.up = false;
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

class Player {
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
        if (checkLaserCollision(this)) triggerDeathSequence(true);
        if (this.y > canvas.height + 600) triggerDeathSequence(false);
        if (checkGoalCollision(this)) triggerVictorySequence();

        checkButtonCollision(this);
    }
    jump() {
        if (this.grounded) {
            this.vy = JUMP_FORCE;
            this.grounded = false;
            jumpSound.currentTime = 0;
            jumpSound.play().catch(() => {});
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
        if (spikeImg.complete && spikeImg.naturalWidth !== 0) ctx.drawImage(spikeImg, renderX, this.y + floatY, this.w, this.h);
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
            ctx.shadowBlur = 30;
            const pulse = Math.sin(Date.now() / 100) * 3;
            ctx.fillRect(renderX + (TILE_SIZE/2 - 6) - pulse/2, this.y, 12 + pulse, this.h);
            ctx.shadowBlur = 0;
            ctx.fillStyle = COLORS.laserCore;
            ctx.fillRect(renderX + (TILE_SIZE/2 - 3), this.y, 6, this.h);
        } else {
            ctx.fillStyle = COLORS.laserOff;
            ctx.fillRect(renderX + (TILE_SIZE/2 - 1), this.y, 4, this.h);
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
    "..........................^........3333333333................3...333............................................",
    "S.........................33333....3333333333.....333.....^......333.........................................G..",
    "333333333333333333333.....33333....3333333333.....333....3333....333.......................333333333333333333333",
    "..........................33333....3333333333.....333....3333....333.......................333333333333333333333",
    "333333333333333333333.....33333....3333333333.....333....3333....333.............................................",
    "333333333333333333333.....33333....3333333333.....333....3333....333.......................3333333333333333333333"
];

const LEVEL_2 = [
    "................................................................................................................",
    "................................................................................................................",
    "................................................33333333........................................................",
    "...............................................33..|...33.......................................................",
    "..........................B.................................................|...................................",
    "........................333333..................33333333..........3.........|...................................",
    "..........................................33....33333333.........333......3333333................................",
    "..............33.......33333333.................33333333...............3........3.............................G.",
    "S.......................3333333.........33......33333333...............33......33............................333",
    "3333333333333...........3333333.......3.....3..........................3333333333.............33............3333",
    "3333333333333...........3333333.......3333333...33333333...............3333333333.............333333333333333333"
];

const LEVEL_3 = [
    "................................................................................................................",
    "................................................................................................................",
    ".....................................................3........................3.................................",
    "......................................L.............3..............B............................................",
    "......................................33........................33333........33...333...........................",
    "...................................|..33..|......33..........33...............3.................................",
    "...............333....33.......333333333333.....................33333.........3.................................",
    "...............3...3...........333333333333.....................33333.........3.................................",
    "S.....................3........3333333333333333.................33333.....................333............|...G..",
    "333333333333.......3333........3333333333333333.................33333............................333333333333333",
    "333333333333...................3333333333333333.................33333............................333333333333333"
];

const LEVELS = [LEVEL_1, LEVEL_2, LEVEL_3];
const player = new Player();
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
    if(badge) badge.innerText = "LEVEL " + (currentLevelIdx + 1).toString().padStart(2, '0');

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
                presentPlatforms.push({x: px, y: py + TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE});
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
    winSound.play().catch(() => {});

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
            title.innerText = "More levels SOON...!"
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

    //shaking of sreen
    let shakeX = 0;
    let shakeY = 0;
    if(deathShake > 0){
        shakeX = (Math.random() - 0.5) * deathShake;
        shakeY = (Math.random() - 0.5) * deathShake;
        deathShake *= 0.9;
        if(deathShake < 1) deathShake = 0;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.save();
    ctx.rect(0,0,viewWidth,canvas.height);
    ctx.clip();

    ctx.fillStyle = COLORS.pastBg;
    ctx.fillRect(0,0,viewWidth,canvas.height);
    drawGrid(0);

    ctx.fillStyle = COLORS.pastPlat;
    ctx.strokeStyle = COLORS.pastBorder;
    ctx.lineWidth = 2;
    pastPlatforms.forEach(p => {
        let rx = p.x - cameraX;
        if(rx > -50 && rx < viewWidth) drawBlock(ctx, rx, p.y, p.w, p.h, CORNER_RADIUS);
    });
    buttons.forEach(b => b.draw(ctx, b.x - cameraX));
    spikes.forEach(s => s.drawGhost(ctx, s.x - cameraX));
    lasers.forEach(l => {
        let renderX = l.x - cameraX;
        if(renderX > -50 && renderX < viewWidth){
            ctx.save();
            ctx.shadowBlur = '#ff0000';
            ctx.shadowBlur = 15;

            ctx.fillStyle = 'rgba(60,0,0,0.7)'
            ctx.fillRect(renderX + (TILE_SIZE/2 - 4), l.y, 8, l.h);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#000000';
            ctx.fillRect(renderX + (TILE_SIZE/2 - 1), l.y, 2, l.h);

            ctx.restore();
        }
    });
    lever.draw(ctx, lever.x - cameraX);
    drawPlayer(ctx, player.x - cameraX, player.y, 1);

    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(viewWidth, 0, viewWidth, canvas.height);
    ctx.clip();
    ctx.fillStyle = COLORS.presentBg;
    ctx.fillRect(viewWidth, 0, viewWidth, canvas.height);

    drawGrid(viewWidth);
    ctx.fillStyle = COLORS.presentPlat;
    ctx.strokeStyle = COLORS.presentBorder;
    ctx.lineWidth = 2;
    presentPlatforms.forEach(p => {
        let rx = p.x - cameraX + viewWidth;
        if(rx > viewWidth - 50 && rx < canvas.width) drawBlock(ctx, rx, p.y, p.w, p.h, CORNER_RADIUS);
    });
    spikes.forEach(s => s.draw(ctx, s.x - cameraX + viewWidth));
    lasers.forEach(l => l.draw(ctx, l.x - cameraX + viewWidth));

    drawPlayer(ctx, player.x - cameraX + viewWidth, player.y, 0.5);

    let goalRX = goalRect.x - cameraX + viewWidth;
    if(goalRX > viewWidth - 50){
        if(goalImg.complete && goalImg.naturalWidth !== 0) ctx.drawImage(goalImg, goalRX, goalRect.y, goalRect.w, goalRect.h);
        else { ctx.fillStyle = COLORS.goal; ctx.fillRect(goalRX, goalRect.y, goalRect.w, goalRect.h); }
    }
    if(rippleEvents.length > 0){
        ctx.fillStyle = '#fff'; ctx.font = '30px "Gagalin"'; ctx.fillText("REALITY SHIFTING...", viewWidth + 40, 80);
    }
    if(laserTimer > 0){
        ctx.fillStyle = '#00ffff'; ctx.font = '25px "Gagalin"';
        ctx.fillText("LASERS OFF: " + Math.ceil(laserTimer/60), viewWidth + 40, 120);
    }
    ctx.restore();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(viewWidth, 0); ctx.lineTo(viewWidth, canvas.height); ctx.stroke();
    ctx.restore();
}

function drawPlayer(ctx, x, y, alpha){
    ctx.save();
    let cx = x + player.w/2;
    let cy = y + player.h/2;
    ctx.translate(cx, cy);
    ctx.rotate(player.angle);
    ctx.globalAlpha = alpha;

    if(isBurned && alpha === 1){
        ctx.shadowColor = 'orange'; ctx.shadowBlur = 20;
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(0,0,player.w/2, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'orange'; ctx.lineWidth = 3; ctx.stroke();
    } else {
        let drawOffset = (player.drawSize - player.h) / 2;
        if(playerImg.complete && playerImg.naturalWidth !== 0){
            ctx.drawImage(playerImg, -player.drawSize/2, -player.drawSize/2 - drawOffset/2, player.drawSize, player.drawSize);
        } else {
            ctx.fillStyle = COLORS.player;
            ctx.beginPath(); ctx.arc(0, 0, player.w/2, 0 , Math.PI*2); ctx.fill();
        }
    }
    ctx.restore();
}

function drawGrid(offsetX){
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    let gridShift = -(cameraX % TILE_SIZE);
    for(let x = gridShift; x < canvas.width/2; x += TILE_SIZE){
        ctx.beginPath(); ctx.moveTo(x + offsetX, 0); ctx.lineTo(x + offsetX, canvas.height); ctx.stroke();
    }
    for(let y = 0; y < canvas.height; y += TILE_SIZE){
        ctx.beginPath(); ctx.moveTo(offsetX, y); ctx.lineTo(offsetX + canvas.width/2, y); ctx.stroke();
    }
}

function update(){
    if(gameOver && deathShake <= 0) return;

    if(laserTimer > 0){
        laserTimer--;
        if(laserTimer <= 0){
            lasersActive = true;
            buttons.forEach(b => b.pressed = false);
        }
    }
    player.update();
    for(let i = rippleEvents.length - 1; i >= 0; i--){
        rippleEvents[i].timer--;
        if(rippleEvents[i].timer <= 0){
            rippleEvents[i].execute();
            rippleEvents.splice(i, 1);
        }
    }
}

function loop(){
    update();
    draw();
    animationId = requestAnimationFrame(loop);
}

function resetGame(){
    if(animationId) cancelAnimationFrame(animationId);
    keys = { right: false, left: false, up: false};
    player.reset();
    lever.active = false;
    victoryMode = false;
    deathShake = 0;
    rippleEvents = [];
    buildLevel();
    gameOver = false;
    document.getElementById('gameEndOverlay').classList.add('hidden');
    loop();
}

//init
resizeCanvas();
setTimeout(() => {
    buildLevel();
    loop();
}, 100);