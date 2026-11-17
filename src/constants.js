// Server and gameplay constants - Tuned for floaty, accessible Mini Militia physics
module.exports = {
  TICK_RATE: 60, // Server physics ticks per second
  BROADCAST_RATE: 30, // Network snapshots per second
  MAP_WIDTH: 2400,
  MAP_HEIGHT: 1400,

  // Tactile, responsive 2D physics (Mini Militia pace with solid gravity)
  GRAVITY: 680,           // Solid, crisp gravity so players fall with proper weight
  JETPACK_FORCE: 1250,    // Punchy, responsive flight thrust
  MOVE_SPEED: 140,        // Mini Militia tactical walk pace
  AIR_MOVE_SPEED: 150,    // Controlled mid-air maneuvering
  GROUND_FRICTION: 0.82,
  AIR_DRAG: 0.94,

  // Player stats
  PLAYER_WIDTH: 38,
  PLAYER_HEIGHT: 52,
  MAX_HEALTH: 100,
  MAX_FUEL: 100,
  FUEL_BURN_RATE: 24,     // Slower burn so flight lasts ~4 seconds
  FUEL_RECOVERY_RATE: 50, // Recharge on ground in ~2 seconds
  HEALTH_RECOVERY_DELAY: 3500, // 3.5s out of combat before health auto-recovers
  HEALTH_RECOVERY_RATE: 12,    // 12 HP per second auto recovery
  RESPAWN_DELAY: 3000,    // ms

  // Weapon definitions from asset pack
  WEAPONS: {
    RIFLE: {
      type: 'RIFLE',
      name: 'Assault Rifle',
      damage: 14,
      bulletSpeed: 880,
      fireInterval: 140, // ms between shots
      maxAmmo: 30,
      reloadTime: 1500, // ms
      spread: 0.05,
      bulletLifetime: 2.2,
      bulletColor: '#fb923c', // orange tracer
      tracerLength: 22,
    },
    SMG: {
      type: 'SMG',
      name: 'Submachine Gun',
      damage: 9,
      bulletSpeed: 840,
      fireInterval: 95, // rapid spray
      maxAmmo: 36,
      reloadTime: 1300,
      spread: 0.09,
      bulletLifetime: 1.8,
      bulletColor: '#facc15', // bright yellow tracer
      tracerLength: 18,
    },
    SHOTGUN: {
      type: 'SHOTGUN',
      name: 'Combat Shotgun',
      damage: 12, // per pellet
      pelletCount: 5, // 5 spread pellets per blast
      bulletSpeed: 820,
      fireInterval: 620,
      maxAmmo: 6,
      reloadTime: 1800,
      spread: 0.14,
      bulletLifetime: 1.2,
      bulletColor: '#f97316', // fiery orange pellets
      tracerLength: 16,
    },
    SNIPER: {
      type: 'SNIPER',
      name: 'Heavy Sniper',
      damage: 65, // high precision damage
      bulletSpeed: 1600,
      fireInterval: 880,
      maxAmmo: 5,
      reloadTime: 2200,
      spread: 0.005,
      bulletLifetime: 1.8,
      bulletColor: '#38bdf8', // cyan high-velocity vapor trail
      tracerLength: 55,
    },
    PISTOL: {
      type: 'PISTOL',
      name: 'Heavy Pistol',
      damage: 22,
      bulletSpeed: 950,
      fireInterval: 220,
      maxAmmo: 12,
      reloadTime: 1100,
      spread: 0.03,
      bulletLifetime: 2.0,
      bulletColor: '#fbbf24', // amber tracer
      tracerLength: 18,
    },
    LASER: {
      type: 'LASER',
      name: 'Laser Rifle',
      damage: 28,
      bulletSpeed: 1400,
      fireInterval: 380,
      maxAmmo: 14,
      reloadTime: 1800,
      spread: 0.02,
      bulletLifetime: 1.5,
      bulletColor: '#c084fc', // purple / magenta beam
      tracerLength: 40,
    },
  },

  GRENADE_STATS: {
    damage: 75,
    radius: 130,
    speed: 460,
    fuseTime: 2500,
    bounceDamping: 0.52,
    maxGrenades: 3,
  },

  // Pickups
  PICKUP_TYPES: {
    HEALTH: 'HEALTH',
    FUEL: 'FUEL',
    RIFLE: 'RIFLE',
    SMG: 'SMG',
    SHOTGUN: 'SHOTGUN',
    SNIPER: 'SNIPER',
    LASER: 'LASER',
    PISTOL: 'PISTOL',
    AMMO: 'AMMO',
    GRENADE: 'GRENADE',
  },

  PICKUP_RESPAWN_TIME: 15000,
};
