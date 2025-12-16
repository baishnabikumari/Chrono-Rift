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
    "S........333333333333......3333....3333333333.....333.....^......333.........................................G..",
    "333333333333333333333......3333....3333333333.....333....333.....333.......................333333333333333333333",
    "333333333333333333333......3333....3333333333.....333....333.....333.......................333333333333333333333",
    "333333333333333333333......3333....3333333333.....333....333.....333.............................................",
    "333333333333333333333......3333....3333333333.....333....333.....333.......................3333333333333333333333"
];