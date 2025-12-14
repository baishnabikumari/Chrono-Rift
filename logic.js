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
    pastBg:'#1e293b',
    pastPlat:'#3b82f6',
    pastBorder:'#60a5fa',
    presentBg:'#3a1a20',
    presentPlat:'#f25349',
    presentBorder:'#ff8a80',
    player:'#ffffff',
    playerGhost:'rgba(255,255,255,0.4)',
    lever:'#fbbf24',
    leverActive:'#4ade80',
    spike:'#ff0000',
    goal:'#10b981',
    laserOff:'#550011',
    button:'#00ffff',
    buttonActive:'#008888',
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

window.toggleUI = function(elementId){
    const el = document.getElementById(elementId);
    if(el){
        if(elementId === 'levelsOverlay' && el.classList.contains('hidden')){
            updateLevelMenu();
        }
        el.classList.toggle('hidden');
    }
};

