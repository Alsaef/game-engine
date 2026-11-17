// Balanced Combat Bot AI - Relaxed, casual, and fun (not pro)
class BotAI {
  constructor(botId, name, avatarStyle = 'scout') {
    this.id = botId;
    this.name = name;
    this.isBot = true;
    this.avatarStyle = avatarStyle;

    // AI state & timers
    this.state = 'PATROL'; // 'PATROL', 'COMBAT', 'IDLE'
    this.stateTimer = 1000 + Math.random() * 2000;
    this.patrolDir = Math.random() > 0.5 ? 1 : -1;

    // Combat behavior tuning
    this.reactionDelay = 800 + Math.random() * 600; // ms to react when spotting player
    this.reactionTimer = 0;
    this.currentTargetId = null;

    // Burst fire control (fire 2-3 shots, then rest 1.5s - 2.5s)
    this.burstShotsRemaining = 0;
    this.burstRestTimer = 1200 + Math.random() * 1000;
    this.burstShotInterval = 280; // ms between burst bullets
    this.burstShotTimer = 0;

    // Jetpack modulation
    this.jetpackBurstTimer = 0;
    this.jetpackRestTimer = 800 + Math.random() * 1200;

    // Grenade throw
    this.grenadeCooldown = 18000 + Math.random() * 12000;

    // Aim smoothing and human-like imperfection
    this.currentAim = Math.random() * Math.PI * 2;
    this.aimNoise = 0;
    this.noiseChangeTimer = 0;
  }

  update(player, allPlayers, map, dt, onShoot, onGrenade) {
    if (player.isDead) {
      this.reactionTimer = 0;
      this.currentTargetId = null;
      return;
    }

    if (!player.inputs) {
      player.inputs = { left: false, right: false, up: false, reload: false, aimAngle: 0 };
    }

    this.stateTimer -= dt * 1000;
    this.burstRestTimer -= dt * 1000;
    this.burstShotTimer -= dt * 1000;
    this.grenadeCooldown -= dt * 1000;
    this.noiseChangeTimer -= dt * 1000;

    // Slowly update aim noise every 0.6s
    if (this.noiseChangeTimer <= 0) {
      this.aimNoise = (Math.random() - 0.5) * 0.35; // ~20 degrees aim imperfection
      this.noiseChangeTimer = 600 + Math.random() * 400;
    }

    // 1. Target Detection (Only detect within realistic vision range of 520px)
    let closestEnemy = null;
    let minDistance = 520; // Vision distance limit

    for (const [id, enemy] of Object.entries(allPlayers)) {
      if (id === player.id || enemy.isDead) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Prefer human players or nearest enemy
      const priorityBonus = enemy.isBot ? 0 : 60;
      if (dist - priorityBonus < minDistance) {
        minDistance = dist;
        closestEnemy = enemy;
      }
    }

    // 2. State Machine: PATROL vs COMBAT
    if (closestEnemy) {
      if (this.currentTargetId !== closestEnemy.id) {
        // Just spotted new enemy: start reaction delay
        this.currentTargetId = closestEnemy.id;
        this.reactionTimer = this.reactionDelay;
      } else if (this.reactionTimer > 0) {
        this.reactionTimer -= dt * 1000;
      }

      this.state = 'COMBAT';
    } else {
      this.currentTargetId = null;
      this.reactionTimer = 0;
      if (this.stateTimer <= 0) {
        this.state = Math.random() > 0.35 ? 'PATROL' : 'IDLE';
        this.patrolDir = Math.random() > 0.5 ? 1 : -1;
        this.stateTimer = 2000 + Math.random() * 3000;
      }
    }

    // 3. State Behavior
    if (this.state === 'IDLE') {
      player.inputs.left = false;
      player.inputs.right = false;
      player.inputs.up = false;
      return;
    }

    if (this.state === 'PATROL') {
      // Casual slow walk left or right
      player.inputs.left = this.patrolDir < 0;
      player.inputs.right = this.patrolDir > 0;

      // Occasional small jetpack hop
      if (Math.random() < 0.02 && player.fuel > 40) {
        player.inputs.up = true;
      } else {
        player.inputs.up = false;
      }

      // Aim in walking direction
      const walkAngle = this.patrolDir > 0 ? 0 : Math.PI;
      this.currentAim += (walkAngle - this.currentAim) * 0.05;
      player.aimAngle = this.currentAim;
      return;
    }

    // 4. COMBAT STATE
    const dx = closestEnemy.x - player.x;
    const dy = closestEnemy.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Aim smoothly towards target with noticeable human lag and noise
    const targetAngle = Math.atan2(dy, dx) + this.aimNoise;
    let diff = targetAngle - this.currentAim;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;

    // Slow rotation speed (turn rate limit)
    this.currentAim += diff * 0.06;
    player.aimAngle = this.currentAim;

    // Movement: Keep comfortable distance (260 - 380px)
    if (dist > 360) {
      player.inputs.left = dx < 0;
      player.inputs.right = dx > 0;
    } else if (dist < 200) {
      // Back away casually
      player.inputs.left = dx > 0;
      player.inputs.right = dx < 0;
    } else {
      // Pause movement in combat zone
      player.inputs.left = false;
      player.inputs.right = false;
    }

    // Jetpack Behavior: Gentle short bursts (not endless zooming)
    const enemyHigher = dy < -60;
    if (enemyHigher && player.fuel > 30) {
      this.jetpackBurstTimer += dt * 1000;
      if (this.jetpackBurstTimer < 450) {
        player.inputs.up = true;
      } else {
        player.inputs.up = false;
        if (this.jetpackBurstTimer > 1200) {
          this.jetpackBurstTimer = 0; // reset burst cycle
        }
      }
    } else {
      player.inputs.up = false;
      this.jetpackBurstTimer = 0;
    }

    // 5. Shooting (Only after reaction delay has elapsed)
    if (this.reactionTimer <= 0 && dist < 460) {
      // If ready for a new burst
      if (this.burstRestTimer <= 0 && this.burstShotsRemaining <= 0) {
        this.burstShotsRemaining = 2 + Math.floor(Math.random() * 2); // 2 to 3 shots
        this.burstShotTimer = 0;
        this.burstRestTimer = 1400 + Math.random() * 1200; // 1.4s - 2.6s rest pause!
      }

      // Fire individual burst shot with delay between each
      if (this.burstShotsRemaining > 0 && this.burstShotTimer <= 0 && !player.reloading) {
        onShoot(player);
        this.burstShotsRemaining -= 1;
        this.burstShotTimer = this.burstShotInterval;
      }
    }

    // Auto reload if magazine empty
    if (player.ammo <= 0 && !player.reloading) {
      player.inputs.reload = true;
    } else {
      player.inputs.reload = false;
    }

    // Grenade throw (rare and only if enemy is grounded and in range)
    if (this.grenadeCooldown <= 0 && player.grenades > 0 && dist > 180 && dist < 360 && this.reactionTimer <= 0) {
      onGrenade(player);
      this.grenadeCooldown = 22000 + Math.random() * 15000; // very long cooldown
    }
  }
}

module.exports = BotAI;
