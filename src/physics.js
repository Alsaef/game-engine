const {
  GRAVITY,
  JETPACK_FORCE,
  MOVE_SPEED,
  AIR_MOVE_SPEED,
  GROUND_FRICTION,
  AIR_DRAG,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  MAX_HEALTH,
  MAX_FUEL,
  FUEL_BURN_RATE,
  FUEL_RECOVERY_RATE,
  HEALTH_RECOVERY_DELAY,
  HEALTH_RECOVERY_RATE,
  RESPAWN_DELAY,
  WEAPONS,
  GRENADE_STATS,
} = require('./constants');

// Check AABB overlap between two rectangles
function checkAABB(r1, r2) {
  return (
    r1.x < r2.x + r2.w &&
    r1.x + r1.w > r2.x &&
    r1.y < r2.y + r2.h &&
    r1.y + r1.h > r2.y
  );
}

// Distance between two points
function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

class PhysicsEngine {
  constructor(map) {
    this.map = map;
  }

  // Update a single player's movement, fuel, weapon reload, and collisions
  updatePlayer(player, dt) {
    if (player.isDead) {
      player.respawnTimer -= dt * 1000;
      if (player.respawnTimer <= 0) {
        this.respawnPlayer(player);
      }
      return;
    }

    const input = player.inputs || {};

    // 1. Calculate gravity (Anti-Gravity Outpost Core effect)
    const distToCore = distance(player.x, player.y, this.map.core.x, this.map.core.y);
    let effectiveGravity = GRAVITY;

    if (distToCore < this.map.core.fieldRadius) {
      // Near core: pleasant floaty anti-gravity lift (65% to 90% of normal gravity)
      // Never drops below 65% so characters always fall with weight and land crisply
      const factor = distToCore / this.map.core.fieldRadius;
      effectiveGravity = GRAVITY * (0.65 + factor * 0.35);
    }

    // 2. Jetpack thrust handling
    // When fuel finishes, the warrior is strictly NOT capable of flying until landing on a platform
    const hasFuel = player.fuel > 0 && !player.outOfFuel;
    const wantsToFly = (input.up || input.jump) && hasFuel;
    const jetForce = player.isBot ? JETPACK_FORCE * 0.75 : JETPACK_FORCE;
    const maxClimb = player.isBot ? -360 : -450;
    const maxFall = player.isBot ? 500 : 580;

    if (wantsToFly) {
      player.isFlying = true;
      player.fuel = Math.max(0, player.fuel - FUEL_BURN_RATE * dt);
      if (player.fuel <= 0) {
        player.fuel = 0;
        player.outOfFuel = true; // Locked until touching ground
        player.isFlying = false;
      }
      player.vy -= jetForce * dt;

      // Terminal vertical climb speed limit
      if (player.vy < maxClimb) player.vy = maxClimb;
    } else {
      player.isFlying = false;
      player.vy += effectiveGravity * dt;

      // Terminal fall speed
      if (player.vy > maxFall) player.vy = maxFall;

      // Fuel strictly ONLY regenerates when touching down on a platform/ground!
      // When airborne, fuel NEVER regenerates
      if (player.isOnGround) {
        player.fuel = Math.min(MAX_FUEL, player.fuel + FUEL_RECOVERY_RATE * dt);
        if (player.fuel > 12) {
          player.outOfFuel = false; // Unlocked after landing and regaining fuel
        }
      }
    }

    // 3. Horizontal movement (tuned for authentic, floaty Mini Militia pace)
    let targetMoveSpeed = player.isOnGround ? MOVE_SPEED : AIR_MOVE_SPEED;
    if (player.isBot) {
      targetMoveSpeed *= 0.65; // Bots move 35% slower than humans for casual feel
    }

    let horizontalInput = 0;
    if (input.left) horizontalInput -= 1;
    if (input.right) horizontalInput += 1;

    if (horizontalInput !== 0) {
      const targetVx = horizontalInput * targetMoveSpeed;
      // Smooth natural acceleration instead of instant twitch speed
      player.vx += (targetVx - player.vx) * Math.min(1, dt * 12);
      player.facing = horizontalInput > 0 ? 1 : -1;
    } else {
      const friction = player.isOnGround ? GROUND_FRICTION : AIR_DRAG;
      player.vx *= Math.pow(friction, dt * 60);
      if (Math.abs(player.vx) < 1) player.vx = 0;
    }

    // 3.5. Health Recovery (Regenerates when out of combat for HEALTH_RECOVERY_DELAY)
    const timeSinceDamage = Date.now() - (player.lastDamageTime || 0);
    if (player.health < MAX_HEALTH && timeSinceDamage >= HEALTH_RECOVERY_DELAY) {
      player.isRegenerating = true;
      player.health = Math.min(MAX_HEALTH, player.health + HEALTH_RECOVERY_RATE * dt);
    } else {
      player.isRegenerating = false;
    }

    // Update aim angle from client if provided
    if (typeof input.aimAngle === 'number') {
      player.aimAngle = input.aimAngle;
    }

    // 4. Position & Collision integration
    this.moveAndCollide(player, dt);

    // 5. Weapon reload & cooldown handling
    if (player.reloading) {
      player.reloadTimer -= dt * 1000;
      if (player.reloadTimer <= 0) {
        player.reloading = false;
        player.ammo = WEAPONS[player.weapon].maxAmmo;
      }
    } else if (input.reload && player.ammo < WEAPONS[player.weapon].maxAmmo) {
      player.reloading = true;
      player.reloadTimer = WEAPONS[player.weapon].reloadTime;
    }

    if (player.shootCooldown > 0) {
      player.shootCooldown -= dt * 1000;
    }
    if (player.grenadeCooldown > 0) {
      player.grenadeCooldown -= dt * 1000;
    }
  }

  // Move player along X and Y with axis-independent collision response
  moveAndCollide(player, dt) {
    const halfW = PLAYER_WIDTH / 2;
    const halfH = PLAYER_HEIGHT / 2;
    const prevX = player.x;
    const prevY = player.y;

    // 1. Horizontal movement & lateral rock/cavern boundary collisions
    player.x += player.vx * dt;
    let playerBoxX = {
      x: player.x - halfW,
      y: player.y - halfH + 4, // inset 4px from top and bottom
      w: PLAYER_WIDTH,
      h: PLAYER_HEIGHT - 8,
    };

    for (const plat of this.map.platforms) {
      // Only solid rock cavern walls block player horizontally
      // (metal catwalks & floating zero-g crates do not obstruct lateral movement)
      if (plat.type === 'rock' || plat.type === 'ground') {
        if (checkAABB(playerBoxX, plat)) {
          if (player.vx > 0) {
            player.x = plat.x - halfW;
          } else if (player.vx < 0) {
            player.x = plat.x + plat.w + halfW;
          }
          player.vx = 0;
          break;
        }
      }
    }

    // 2. Vertical movement & platform collisions
    player.y += player.vy * dt;
    player.isOnGround = false;

    for (const plat of this.map.platforms) {
      if (plat.type === 'crate') {
        // Floating crates drifting in zero-g do not act as solid ground floors
        continue;
      }

      if (plat.type === 'rock') {
        // Solid rock boundaries (e.g. cavern ceiling)
        const playerBoxY = {
          x: player.x - halfW + 2,
          y: player.y - halfH,
          w: PLAYER_WIDTH - 4,
          h: PLAYER_HEIGHT,
        };
        if (checkAABB(playerBoxY, plat)) {
          if (player.vy < 0) {
            // Hitting ceiling
            player.y = plat.y + plat.h + halfH;
            player.vy = 0;
            break;
          }
        }
      } else if (plat.type === 'ground' || plat.type === 'metal') {
        // Semi-solid / One-way platform surface (Mini Militia style):
        // Only land if moving downward or standing on top, and feet were at or above the deck
        const playerLeft = player.x - halfW + 4;
        const playerRight = player.x + halfW - 4;
        const platLeft = plat.x;
        const platRight = plat.x + plat.w;

        // Check horizontal overlap with platform deck
        if (playerRight > platLeft && playerLeft < platRight) {
          const feetPrev = prevY + halfH;
          const feetCurrent = player.y + halfH;
          const surfaceY = plat.y;

          // If falling/landing (vy >= 0) and feet were above or at the platform surface
          // (allowing a small step-up tolerance so walking smoothly across platforms works)
          if (player.vy >= 0 && feetPrev <= surfaceY + 14 && feetCurrent >= surfaceY - 2) {
            player.y = surfaceY - halfH;
            player.vy = 0;
            player.isOnGround = true;
            break;
          }
        }
      }
    }

    // Keep player in map bounds
    if (player.x < halfW + 10) {
      player.x = halfW + 10;
      player.vx = 0;
    } else if (player.x > this.map.width - halfW - 10) {
      player.x = this.map.width - halfW - 10;
      player.vx = 0;
    }

    if (player.y < halfH + 10) {
      player.y = halfH + 10;
      player.vy = 0;
    } else if (player.y > this.map.height - halfH - 10) {
      player.y = this.map.height - halfH - 10;
      player.vy = 0;
      player.isOnGround = true;
    }
  }

  // Update projectiles (bullets, lasers, grenades)
  updateProjectiles(bullets, grenades, players, onKill, onHit, onExplode, dt) {
    // 1. Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.lifetime -= dt;

      if (b.lifetime <= 0) {
        bullets.splice(i, 1);
        continue;
      }

      // Check collision with platforms/crates
      let hitPlatform = false;
      const bPoint = { x: b.x - 3, y: b.y - 3, w: 6, h: 6 };
      for (const plat of this.map.platforms) {
        if (checkAABB(bPoint, plat)) {
          hitPlatform = true;
          onHit({ x: b.x, y: b.y, type: 'spark', normalX: -Math.sign(b.vx), normalY: -Math.sign(b.vy) });
          break;
        }
      }
      if (hitPlatform) {
        if (b.weaponType === 'ROCKET') {
          this.triggerExplosion(b.x, b.y, b.radius || 135, b.damage || 90, b.ownerId, 'ROCKET', players, onKill, onHit, onExplode);
        }
        bullets.splice(i, 1);
        continue;
      }

      // Check collision with players
      let hitPlayer = false;
      for (const [id, p] of Object.entries(players)) {
        if (p.isDead || id === b.ownerId) continue;

        const pBox = {
          x: p.x - PLAYER_WIDTH / 2,
          y: p.y - PLAYER_HEIGHT / 2,
          w: PLAYER_WIDTH,
          h: PLAYER_HEIGHT,
        };

        if (checkAABB(bPoint, pBox)) {
          hitPlayer = true;
          if (b.weaponType === 'ROCKET') {
            this.triggerExplosion(b.x, b.y, b.radius || 135, b.damage || 90, b.ownerId, 'ROCKET', players, onKill, onHit, onExplode);
            bullets.splice(i, 1);
            break;
          }

          const actualDamage = b.isBot ? Math.max(6, Math.round(b.damage * 0.65)) : b.damage;
          p.health -= actualDamage;
          p.lastDamageTime = Date.now();
          p.isRegenerating = false;
          onHit({
            x: b.x,
            y: b.y,
            type: 'blood',
            damage: actualDamage,
            targetId: id,
          });

          if (p.health <= 0) {
            p.health = 0;
            p.isDead = true;
            p.respawnTimer = RESPAWN_DELAY;
            p.deaths = (p.deaths || 0) + 1;

            const killer = players[b.ownerId];
            if (killer) {
              killer.kills = (killer.kills || 0) + 1;
              killer.score = (killer.score || 0) + 100;
            }

            onKill({
              killerId: b.ownerId,
              killerName: killer ? killer.name : 'Unknown',
              victimId: id,
              victimName: p.name,
              weapon: b.weaponType,
            });
          }

          bullets.splice(i, 1);
          break;
        }
      }
    }

    // 2. Grenades
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];

      // Gravity and movement
      g.vy += GRAVITY * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.fuse -= dt * 1000;

      // Platform bounce collision
      const gBox = { x: g.x - 8, y: g.y - 8, w: 16, h: 16 };
      for (const plat of this.map.platforms) {
        if (checkAABB(gBox, plat)) {
          // Invert velocity with damping
          if (Math.abs(g.vy) > 80) {
            g.vy = -g.vy * GRENADE_STATS.bounceDamping;
          } else {
            g.vy = 0;
          }
          g.vx *= 0.85; // friction on bounce
          break;
        }
      }

      // Grenade explosion trigger
      if (g.fuse <= 0) {
        this.triggerExplosion(g.x, g.y, GRENADE_STATS.radius, GRENADE_STATS.damage, g.ownerId, 'GRENADE', players, onKill, onHit, onExplode);
        grenades.splice(i, 1);
      }
    }
  }

  // Common AoE explosion trigger for Grenades and Rocket Launcher
  triggerExplosion(x, y, radius, baseDamage, ownerId, weaponName, players, onKill, onHit, onExplode) {
    onExplode({
      x,
      y,
      radius,
    });

    for (const [id, p] of Object.entries(players)) {
      if (p.isDead) continue;
      const dist = distance(x, y, p.x, p.y);
      if (dist <= radius) {
        const falloff = 1 - dist / radius;
        const dmg = Math.round(baseDamage * falloff);
        p.health -= dmg;
        p.lastDamageTime = Date.now();
        p.isRegenerating = false;

        // Knockback impulse
        const angle = Math.atan2(p.y - y, p.x - x);
        p.vx += Math.cos(angle) * 480 * falloff;
        p.vy += Math.sin(angle) * 480 * falloff;

        onHit({
          x: p.x,
          y: p.y,
          type: 'explosion',
          damage: dmg,
          targetId: id,
        });

        if (p.health <= 0) {
          p.health = 0;
          p.isDead = true;
          p.respawnTimer = RESPAWN_DELAY;
          p.deaths = (p.deaths || 0) + 1;

          const killer = players[ownerId];
          if (killer) {
            killer.kills = (killer.kills || 0) + 1;
            killer.score = (killer.score || 0) + 150;
          }

          onKill({
            killerId: ownerId,
            killerName: killer ? killer.name : weaponName,
            victimId: id,
            victimName: p.name,
            weapon: weaponName,
          });
        }
      }
    }
  }

  // Check pickup collection by players
  updatePickups(pickups, players, onPickupCollected, dt) {
    for (const pk of pickups) {
      if (pk.cooldown > 0) {
        pk.cooldown -= dt * 1000;
        continue;
      }

      const pkBox = { x: pk.x - 20, y: pk.y - 20, w: 40, h: 40 };

      for (const [id, p] of Object.entries(players)) {
        if (p.isDead) continue;

        const pBox = {
          x: p.x - PLAYER_WIDTH / 2,
          y: p.y - PLAYER_HEIGHT / 2,
          w: PLAYER_WIDTH,
          h: PLAYER_HEIGHT,
        };

        if (checkAABB(pkBox, pBox)) {
          let collected = false;

          if (pk.type === 'HEALTH' && p.health < MAX_HEALTH) {
            p.health = Math.min(MAX_HEALTH, p.health + 45);
            collected = true;
          } else if (pk.type === 'FUEL' && p.fuel < MAX_FUEL) {
            p.fuel = MAX_FUEL;
            p.outOfFuel = false;
            collected = true;
          } else if (['RIFLE', 'SMG', 'SHOTGUN', 'SNIPER', 'PISTOL', 'LASER', 'ROCKET'].includes(pk.type)) {
            p.weapon = pk.type;
            const wpn = WEAPONS[pk.type];
            p.ammo = wpn ? wpn.maxAmmo : 30;
            p.reloading = false;
            collected = true;
          } else if (pk.type === 'AMMO') {
            const wpn = WEAPONS[p.weapon] || WEAPONS.RIFLE;
            if (p.ammo < wpn.maxAmmo) {
              p.ammo = wpn.maxAmmo;
              p.reloading = false;
              collected = true;
            }
          } else if (pk.type === 'GRENADE' && p.grenades < GRENADE_STATS.maxGrenades) {
            p.grenades = Math.min(GRENADE_STATS.maxGrenades, p.grenades + 1);
            collected = true;
          }

          if (collected) {
            pk.cooldown = 14000; // 14 seconds until respawn
            onPickupCollected({
              pickupId: pk.id,
              playerId: id,
              type: pk.type,
            });
            break;
          }
        }
      }
    }
  }

  // Respawn a player at an optimal safe spawn point
  respawnPlayer(player) {
    const sp = this.map.spawnPoints[Math.floor(Math.random() * this.map.spawnPoints.length)];
    player.x = sp.x;
    player.y = sp.y;
    player.vx = 0;
    player.vy = 0;
    player.health = MAX_HEALTH;
    player.fuel = MAX_FUEL;
    player.weapon = 'RIFLE';
    player.ammo = WEAPONS.RIFLE.maxAmmo;
    player.grenades = 2;
    player.isDead = false;
    player.reloading = false;
    player.isFlying = false;
    player.outOfFuel = false;
    player.lastDamageTime = 0;
    player.isRegenerating = false;
    player.respawnTimer = 0;
  }
}

module.exports = PhysicsEngine;
