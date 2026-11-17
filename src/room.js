const PhysicsEngine = require('./physics');
const BotAI = require('./bot');
const MAP = require('./map');
const {
  TICK_RATE,
  BROADCAST_RATE,
  MAX_HEALTH,
  MAX_FUEL,
  WEAPONS,
  GRENADE_STATS,
} = require('./constants');

class Room {
  constructor(roomCode, options = {}) {
    this.roomCode = roomCode;
    this.map = JSON.parse(JSON.stringify(MAP));
    this.physics = new PhysicsEngine(this.map);

    this.clients = new Map(); // socketId -> WebSocket instance
    this.players = {}; // socketId -> Player
    this.bots = {}; // botId -> BotAI
    this.bullets = [];
    this.grenades = [];
    this.pickups = JSON.parse(JSON.stringify(this.map.initialPickups));
    this.killFeed = [];

    this.createdAt = Date.now();
    this.bulletCounter = 0;
    this.grenadeCounter = 0;

    this.tickInterval = null;
    this.broadcastInterval = null;
    this.lastTickTime = Date.now();

    // Start physics and network broadcast loops
    this.start();

    // Optionally spawn initial bots
    const botCount = typeof options.botCount === 'number' ? options.botCount : 0;
    for (let i = 1; i <= botCount; i++) {
      this.addBot(`BOT_${i}`, i % 2 === 0 ? 'scout' : 'soldier');
    }
  }

  start() {
    const dt = 1 / TICK_RATE;
    this.tickInterval = setInterval(() => {
      this.tick(dt);
    }, 1000 / TICK_RATE);

    this.broadcastInterval = setInterval(() => {
      this.broadcastState();
    }, 1000 / BROADCAST_RATE);
  }

  stop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    this.tickInterval = null;
    this.broadcastInterval = null;
  }

  // Broadcast JSON message to all connected clients in this room
  broadcast(type, payload) {
    const data = JSON.stringify({ type, payload });
    for (const ws of this.clients.values()) {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(data);
      }
    }
  }

  // Send JSON message to a specific client
  sendTo(socketId, type, payload) {
    const ws = this.clients.get(socketId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }

  // Add human player to room
  addPlayer(socketId, name = 'Soldier', avatarStyle = 'soldier', ws = null) {
    if (ws) {
      this.clients.set(socketId, ws);
    }

    const sp = this.map.spawnPoints[Math.floor(Math.random() * this.map.spawnPoints.length)];

    const player = {
      id: socketId,
      name: (name || 'Soldier').substring(0, 16),
      avatarStyle: avatarStyle || 'soldier',
      x: sp.x,
      y: sp.y,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      facing: 1,
      health: MAX_HEALTH,
      fuel: MAX_FUEL,
      weapon: 'RIFLE',
      ammo: WEAPONS.RIFLE.maxAmmo,
      grenades: 2,
      isDead: false,
      isFlying: false,
      isOnGround: false,
      reloading: false,
      reloadTimer: 0,
      shootCooldown: 0,
      grenadeCooldown: 0,
      respawnTimer: 0,
      lastDamageTime: 0,
      isRegenerating: false,
      kills: 0,
      deaths: 0,
      score: 0,
      ping: 0,
      inputs: {
        left: false,
        right: false,
        up: false,
        jump: false,
        reload: false,
        aimAngle: 0,
      },
    };

    this.players[socketId] = player;
    return player;
  }

  // Remove player
  removePlayer(socketId) {
    delete this.players[socketId];
    this.clients.delete(socketId);
  }

  // Add bot player
  addBot(name = 'BOT_X', avatarStyle) {
    const avatarStyles = ['soldier', 'scout', 'veteran', 'raphile', 'simon'];
    const chosenStyle = avatarStyle || avatarStyles[Math.floor(Math.random() * avatarStyles.length)];
    const botId = `bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const botAI = new BotAI(botId, name, chosenStyle);
    this.bots[botId] = botAI;

    const sp = this.map.spawnPoints[Math.floor(Math.random() * this.map.spawnPoints.length)];
    this.players[botId] = {
      id: botId,
      name,
      avatarStyle: chosenStyle,
      isBot: true,
      x: sp.x,
      y: sp.y,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      facing: 1,
      health: MAX_HEALTH,
      fuel: MAX_FUEL,
      weapon: Math.random() > 0.5 ? 'SMG' : 'RIFLE',
      ammo: 30,
      grenades: 1,
      isDead: false,
      isFlying: false,
      isOnGround: false,
      reloading: false,
      reloadTimer: 0,
      shootCooldown: 0,
      grenadeCooldown: 0,
      respawnTimer: 0,
      lastDamageTime: 0,
      isRegenerating: false,
      kills: 0,
      deaths: 0,
      score: 0,
      inputs: { left: false, right: false, up: false, jump: false, aimAngle: 0 },
    };
    return this.players[botId];
  }

  // Remove bot player
  removeBot() {
    const botIds = Object.keys(this.bots);
    if (botIds.length > 0) {
      const id = botIds[botIds.length - 1];
      delete this.bots[id];
      delete this.players[id];
      return true;
    }
    return false;
  }

  // Player action: update movement inputs
  handleInput(socketId, inputs) {
    const player = this.players[socketId];
    if (!player || player.isDead) return;

    player.inputs = {
      left: !!inputs.left,
      right: !!inputs.right,
      up: !!inputs.up,
      jump: !!inputs.jump,
      reload: !!inputs.reload,
      aimAngle: typeof inputs.aimAngle === 'number' ? inputs.aimAngle : player.aimAngle,
    };

    if (typeof inputs.aimAngle === 'number') {
      player.aimAngle = inputs.aimAngle;
      player.facing = Math.cos(inputs.aimAngle) >= 0 ? 1 : -1;
    }
  }

  // Player action: shoot weapon
  handleShoot(socketId, angle) {
    const player = this.players[socketId];
    if (!player || player.isDead || player.reloading) return;

    if (typeof angle === 'number') {
      player.aimAngle = angle;
      player.facing = Math.cos(angle) >= 0 ? 1 : -1;
    }

    if (player.shootCooldown > 0) return;

    const weapon = WEAPONS[player.weapon] || WEAPONS.RIFLE;
    if (player.ammo <= 0) {
      this.handleReload(socketId);
      return;
    }

    // Fire weapon
    player.ammo -= 1;
    player.shootCooldown = weapon.fireInterval;

    const barrelDist = 28;
    const spawnX = player.x + Math.cos(player.aimAngle) * barrelDist;
    const spawnY = player.y - 6 + Math.sin(player.aimAngle) * barrelDist;

    if (player.weapon === 'SHOTGUN') {
      // Multi-pellet spread
      const pelletCount = weapon.pellets || 5;
      for (let i = 0; i < pelletCount; i++) {
        const spreadOffset = (Math.random() - 0.5) * weapon.spread;
        const pelletAngle = player.aimAngle + spreadOffset;
        const speed = weapon.bulletSpeed * (0.9 + Math.random() * 0.2);

        this.bullets.push({
          id: `b_${this.bulletCounter++}`,
          ownerId: socketId,
          x: spawnX,
          y: spawnY,
          vx: Math.cos(pelletAngle) * speed,
          vy: Math.sin(pelletAngle) * speed,
          damage: weapon.damage,
          color: weapon.bulletColor,
          length: weapon.tracerLength,
          weaponType: 'SHOTGUN',
          lifetime: weapon.bulletLifetime,
        });
      }
    } else {
      // Single precision or rapid bullet
      const spreadOffset = (Math.random() - 0.5) * (weapon.spread || 0.04);
      const shotAngle = player.aimAngle + spreadOffset;

      this.bullets.push({
        id: `b_${this.bulletCounter++}`,
        ownerId: socketId,
        x: spawnX,
        y: spawnY,
        vx: Math.cos(shotAngle) * weapon.bulletSpeed,
        vy: Math.sin(shotAngle) * weapon.bulletSpeed,
        damage: weapon.damage,
        color: weapon.bulletColor,
        length: weapon.tracerLength,
        weaponType: player.weapon,
        lifetime: weapon.bulletLifetime,
        radius: weapon.radius || 0,
      });
    }

    // Broadcast weapon fired event for gunshot audio & muzzle flash
    this.broadcast('weapon_fired', {
      playerId: socketId,
      weapon: player.weapon,
      x: spawnX,
      y: spawnY,
      aimAngle: player.aimAngle,
    });

    // Auto-reload when clip reaches 0
    if (player.ammo <= 0) {
      this.handleReload(socketId);
    }
  }

  // Player action: throw grenade
  handleGrenade(socketId, angle = 0) {
    const player = this.players[socketId];
    if (!player || player.isDead || player.grenades <= 0 || player.grenadeCooldown > 0) return;

    player.grenades -= 1;
    player.grenadeCooldown = 800; // 800ms cooldown

    const throwSpeed = GRENADE_STATS.speed;
    const grenade = {
      id: `g_${this.grenadeCounter++}`,
      ownerId: socketId,
      x: player.x + Math.cos(angle) * 20,
      y: player.y - 10 + Math.sin(angle) * 20,
      vx: player.vx * 0.4 + Math.cos(angle) * throwSpeed,
      vy: player.vy * 0.4 + Math.sin(angle) * throwSpeed,
      fuse: GRENADE_STATS.fuseTime,
      radius: GRENADE_STATS.radius,
    };

    this.grenades.push(grenade);

    this.broadcast('grenade_thrown', {
      playerId: socketId,
      x: grenade.x,
      y: grenade.y,
    });
  }

  // Player action: reload weapon
  handleReload(socketId) {
    const player = this.players[socketId];
    if (!player || player.isDead || player.reloading) return;
    const weapon = WEAPONS[player.weapon] || WEAPONS.RIFLE;
    if (player.ammo < weapon.maxAmmo) {
      player.reloading = true;
      player.reloadTimer = weapon.reloadTime;
    }
  }

  // Server physics tick
  tick(dt) {
    // 1. Update bot AI
    for (const [botId, botAI] of Object.entries(this.bots)) {
      const player = this.players[botId];
      if (player) {
        botAI.update(
          player,
          this.players,
          this.map,
          dt,
          (bot) => this.handleShoot(bot.id, bot.aimAngle),
          (bot) => this.handleGrenade(bot.id, bot.aimAngle)
        );
      }
    }

    // 2. Update players
    for (const player of Object.values(this.players)) {
      this.physics.updatePlayer(player, dt);
    }

    // 3. Update projectiles & collisions
    this.physics.updateProjectiles(
      this.bullets,
      this.grenades,
      this.players,
      (killEvent) => {
        // Kill callback
        this.killFeed.unshift({
          ...killEvent,
          timestamp: Date.now(),
        });
        if (this.killFeed.length > 8) this.killFeed.pop();

        this.broadcast('kill_feed', killEvent);
      },
      (hitEvent) => {
        this.broadcast('hit_impact', hitEvent);
      },
      (explodeEvent) => {
        this.broadcast('explosion', explodeEvent);
      },
      dt
    );

    // 4. Update pickups
    this.physics.updatePickups(this.pickups, this.players, (pickupEvent) => {
      this.broadcast('pickup_collected', pickupEvent);
    }, dt);
  }

  // Broadcast world state snapshot to clients
  broadcastState() {
    const snapshot = {
      timestamp: Date.now(),
      matchDuration: Math.floor((Date.now() - this.createdAt) / 1000),
      players: this.players,
      bullets: this.bullets.map(b => ({
        id: b.id,
        x: Math.round(b.x),
        y: Math.round(b.y),
        vx: Math.round(b.vx),
        vy: Math.round(b.vy),
        color: b.color,
        length: b.length,
        weaponType: b.weaponType,
      })),
      grenades: this.grenades.map(g => ({
        id: g.id,
        x: Math.round(g.x),
        y: Math.round(g.y),
        fuse: Math.round(g.fuse),
      })),
      pickups: this.pickups.map(p => ({
        id: p.id,
        type: p.type,
        x: p.x,
        y: p.y,
        active: !p.cooldown || p.cooldown <= 0,
      })),
    };

    this.broadcast('game_state', snapshot);
  }
}

module.exports = Room;
