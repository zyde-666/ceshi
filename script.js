const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hpEl = document.getElementById("hp");
const goldEl = document.getElementById("gold");
const comboEl = document.getElementById("combo");
const tipsEl = document.getElementById("tips");

const state = {
  time: 0,
  cameraX: 0,
  rooms: new Map(),
  rngSeed: 42,
  score: {
    hp: 5,
    gold: 0,
    combo: 0,
  },
  input: {
    left: false,
    right: false,
    jump: false,
    attack: false,
    dash: false,
  },
  player: {
    x: 120,
    y: 0,
    width: 32,
    height: 46,
    vx: 0,
    vy: 0,
    speed: 3.2,
    jump: 11,
    onGround: false,
    facing: 1,
    invincible: 0,
    dashCooldown: 0,
    attackTimer: 0,
  },
};

const CONFIG = {
  gravity: 0.55,
  friction: 0.82,
  floor: 460,
  roomWidth: 960,
};

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => (value = (value * 16807) % 2147483647) / 2147483647;
}

function roomIndexForX(x) {
  return Math.floor(x / CONFIG.roomWidth);
}

function createRoom(index) {
  const rand = seededRandom(state.rngSeed + index * 9973);
  const platforms = [];
  const enemies = [];
  const loot = [];

  const baseX = index * CONFIG.roomWidth;
  const platformCount = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < platformCount; i += 1) {
    const width = 120 + rand() * 120;
    const height = 16;
    const x = baseX + 80 + rand() * (CONFIG.roomWidth - 160 - width);
    const y = 280 + rand() * 120;
    platforms.push({ x, y, width, height });
  }

  const enemyCount = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < enemyCount; i += 1) {
    const x = baseX + 140 + rand() * (CONFIG.roomWidth - 280);
    enemies.push({
      x,
      y: CONFIG.floor - 32,
      width: 28,
      height: 28,
      hp: 2,
      dir: rand() > 0.5 ? 1 : -1,
      speed: 1 + rand() * 0.8,
      alive: true,
      hitTimer: 0,
    });
  }

  const lootCount = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < lootCount; i += 1) {
    const x = baseX + 100 + rand() * (CONFIG.roomWidth - 200);
    const y = 200 + rand() * 160;
    loot.push({ x, y, collected: false, float: rand() * Math.PI * 2 });
  }

  return { platforms, enemies, loot };
}

function getRoom(index) {
  if (!state.rooms.has(index)) {
    state.rooms.set(index, createRoom(index));
    tipsEl.textContent = `进入房间 ${index + 1}：新的敌人与奖励刷新`; 
  }
  return state.rooms.get(index);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function resolveCollisions(player, platforms) {
  player.onGround = false;
  const solids = [...platforms, {
    x: -Infinity,
    y: CONFIG.floor,
    width: Infinity,
    height: 60,
  }];

  for (const platform of solids) {
    if (!rectsOverlap(player, platform)) continue;
    const prevY = player.y - player.vy;
    const prevBottom = prevY + player.height;
    if (prevBottom <= platform.y + 8 && player.vy >= 0) {
      player.y = platform.y - player.height;
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0) {
      player.y = platform.y + platform.height;
      player.vy = 0.3;
    }
  }
}

function handleInput() {
  const { player } = state;
  if (state.input.left) {
    player.vx = -player.speed;
    player.facing = -1;
  } else if (state.input.right) {
    player.vx = player.speed;
    player.facing = 1;
  } else {
    player.vx *= CONFIG.friction;
  }

  if (state.input.jump && player.onGround) {
    player.vy = -player.jump;
    player.onGround = false;
  }

  if (state.input.dash && player.dashCooldown <= 0) {
    player.vx = player.facing * 9;
    player.vy = -1;
    player.dashCooldown = 40;
  }

  if (state.input.attack && player.attackTimer <= 0) {
    player.attackTimer = 18;
  }
}

function updatePlayer() {
  const { player } = state;
  handleInput();
  player.vy += CONFIG.gravity;
  player.vy = clamp(player.vy, -18, 12);
  player.x += player.vx;
  player.y += player.vy;

  const currentRoom = getRoom(roomIndexForX(player.x));
  resolveCollisions(player, currentRoom.platforms);

  player.y = clamp(player.y, -40, CONFIG.floor - player.height);
  player.dashCooldown = Math.max(0, player.dashCooldown - 1);
  player.attackTimer = Math.max(0, player.attackTimer - 1);
  player.invincible = Math.max(0, player.invincible - 1);
}

function updateEnemies(room) {
  for (const enemy of room.enemies) {
    if (!enemy.alive) continue;
    enemy.x += enemy.dir * enemy.speed;
    enemy.hitTimer = Math.max(0, enemy.hitTimer - 1);

    const leftBound = roomIndexForX(enemy.x) * CONFIG.roomWidth + 40;
    const rightBound = leftBound + CONFIG.roomWidth - 80;
    if (enemy.x < leftBound || enemy.x > rightBound) {
      enemy.dir *= -1;
    }
  }
}

function updateLoot(room) {
  for (const item of room.loot) {
    item.float += 0.04;
  }
}

function handleCombat(room) {
  const { player } = state;
  if (player.attackTimer > 0) {
    const attackBox = {
      x: player.x + (player.facing === 1 ? player.width : -36),
      y: player.y + 8,
      width: 36,
      height: 30,
    };
    for (const enemy of room.enemies) {
      if (!enemy.alive) continue;
      if (rectsOverlap(attackBox, enemy)) {
        enemy.hp -= 1;
        enemy.hitTimer = 12;
        if (enemy.hp <= 0) {
          enemy.alive = false;
          state.score.combo += 1;
          state.score.gold += 2;
        }
      }
    }
  }

  if (player.invincible === 0) {
    for (const enemy of room.enemies) {
      if (!enemy.alive) continue;
      if (rectsOverlap(player, enemy)) {
        state.score.hp = Math.max(0, state.score.hp - 1);
        state.score.combo = 0;
        player.invincible = 50;
        player.vx = -player.facing * 4;
        player.vy = -6;
        break;
      }
    }
  }

  for (const item of room.loot) {
    if (item.collected) continue;
    const lootBox = { x: item.x - 10, y: item.y - 10, width: 20, height: 20 };
    if (rectsOverlap(player, lootBox)) {
      item.collected = true;
      state.score.gold += 1;
    }
  }
}

function updateHUD() {
  hpEl.textContent = state.score.hp;
  goldEl.textContent = state.score.gold;
  comboEl.textContent = state.score.combo;
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#10162a");
  gradient.addColorStop(0.5, "#0b1325");
  gradient.addColorStop(1, "#070b16");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  for (let i = 0; i < 80; i += 1) {
    const x = (i * 137 + state.time * 0.4) % (canvas.width + 120) - 60;
    const y = (i * 53) % 240;
    const size = (i % 3) + 1;
    ctx.fillRect(x, y, size, size);
  }

  ctx.fillStyle = "rgba(72, 105, 173, 0.24)";
  for (let i = 0; i < 30; i += 1) {
    const x = ((state.time * 0.18 + i * 140) % (canvas.width + 280)) - 140;
    const y = 140 + (i % 6) * 28;
    ctx.beginPath();
    ctx.ellipse(x, y, 80, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRoom(room, offsetX) {
  ctx.fillStyle = "#131a2d";
  ctx.fillRect(-offsetX, CONFIG.floor, canvas.width + 200, 80);

  ctx.fillStyle = "#2a3554";
  for (const platform of room.platforms) {
    ctx.fillRect(platform.x - offsetX, platform.y, platform.width, platform.height);
    ctx.fillStyle = "rgba(114, 156, 255, 0.2)";
    ctx.fillRect(platform.x - offsetX, platform.y, platform.width, 3);
    ctx.fillStyle = "#2a3554";
  }

  ctx.fillStyle = "#f3d676";
  for (const item of room.loot) {
    if (item.collected) continue;
    const bob = Math.sin(item.float) * 6;
    ctx.beginPath();
    ctx.arc(item.x - offsetX, item.y + bob, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const enemy of room.enemies) {
    if (!enemy.alive) continue;
    ctx.fillStyle = enemy.hitTimer > 0 ? "#ff8c86" : "#aa5561";
    ctx.fillRect(enemy.x - offsetX, enemy.y, enemy.width, enemy.height);
    ctx.fillStyle = "#120d12";
    ctx.fillRect(enemy.x - offsetX + 6, enemy.y + 8, 6, 6);
  }
}

function drawPlayer() {
  const { player } = state;
  ctx.fillStyle = player.invincible > 0 ? "rgba(120, 233, 255, 0.8)" : "#7be0ff";
  ctx.fillRect(player.x - state.cameraX, player.y, player.width, player.height);
  ctx.fillStyle = "#0b1426";
  ctx.fillRect(
    player.x - state.cameraX + 8,
    player.y + 12,
    8,
    8
  );

  if (player.attackTimer > 0) {
    ctx.fillStyle = "rgba(255, 210, 120, 0.75)";
    const attackX =
      player.x - state.cameraX + (player.facing === 1 ? player.width : -34);
    ctx.fillRect(attackX, player.y + 12, 28, 20);
  }
}

function updateCamera() {
  const target = state.player.x - canvas.width / 2 + state.player.width / 2;
  state.cameraX += (target - state.cameraX) * 0.1;
}

function update() {
  state.time += 1;
  updatePlayer();
  updateCamera();
  const roomIndex = roomIndexForX(state.player.x);
  const room = getRoom(roomIndex);
  updateEnemies(room);
  updateLoot(room);
  handleCombat(room);
  updateHUD();
}

function render() {
  drawBackground();

  const currentRoomIndex = roomIndexForX(state.player.x);
  const neighbors = [currentRoomIndex - 1, currentRoomIndex, currentRoomIndex + 1];
  for (const index of neighbors) {
    const room = getRoom(index);
    drawRoom(room, state.cameraX);
  }

  drawPlayer();
}

function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}

function setKey(key, isDown) {
  switch (key) {
    case "a":
    case "arrowleft":
      state.input.left = isDown;
      break;
    case "d":
    case "arrowright":
      state.input.right = isDown;
      break;
    case " ":
    case "arrowup":
    case "w":
      state.input.jump = isDown;
      break;
    case "j":
      state.input.attack = isDown;
      break;
    case "k":
      state.input.dash = isDown;
      break;
    default:
      break;
  }
}

window.addEventListener("keydown", (event) => {
  setKey(event.key.toLowerCase(), true);
});

window.addEventListener("keyup", (event) => {
  setKey(event.key.toLowerCase(), false);
});

window.addEventListener("blur", () => {
  state.input.left = false;
  state.input.right = false;
  state.input.jump = false;
  state.input.attack = false;
  state.input.dash = false;
});

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = 960 * ratio;
  canvas.height = 540 * ratio;
  canvas.style.width = "960px";
  canvas.style.height = "540px";
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

gameLoop();
