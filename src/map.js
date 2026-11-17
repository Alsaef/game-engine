// Map definition for "Anti-Gravity Outpost" (Broken Space Station in Asteroid)
const { MAP_WIDTH, MAP_HEIGHT, PICKUP_TYPES } = require('./constants');

const MAP = {
  width: MAP_WIDTH,
  height: MAP_HEIGHT,

  // Anti-Gravity Core generator in the center
  core: {
    x: 1200,
    y: 650,
    radius: 120,
    fieldRadius: 420, // Low-gravity zone around the core
    pulseSpeed: 1.5,
  },

  // Solid platforms (AABB colliders)
  // type: 'ground' | 'metal' | 'crate' | 'rock'
  platforms: [
    // Outer boundaries (Rock cavern walls)
    { id: 'bound-bottom', x: 0, y: MAP_HEIGHT - 60, w: MAP_WIDTH, h: 60, type: 'ground' },
    { id: 'bound-top', x: 0, y: 0, w: MAP_WIDTH, h: 50, type: 'rock' },
    { id: 'bound-left', x: 0, y: 0, w: 50, h: MAP_HEIGHT, type: 'rock' },
    { id: 'bound-right', x: MAP_WIDTH - 50, y: 0, w: 50, h: MAP_HEIGHT, type: 'rock' },

    // Main central command tier (under the glowing blue Anti-Gravity core)
    { id: 'plat-center-main', x: 920, y: 880, w: 560, h: 36, type: 'metal', name: 'Reactor Deck' },
    { id: 'plat-center-top', x: 1020, y: 380, w: 360, h: 28, type: 'metal', name: 'Upper Catwalk' },

    // Left Sector (Observation & Fuel depot)
    { id: 'plat-left-low', x: 160, y: 980, w: 460, h: 32, type: 'metal' },
    { id: 'plat-left-mid', x: 260, y: 720, w: 400, h: 28, type: 'metal' },
    { id: 'plat-left-high', x: 120, y: 440, w: 380, h: 28, type: 'metal' },
    { id: 'plat-left-bridge', x: 560, y: 560, w: 240, h: 24, type: 'metal' },

    // Right Sector (Armory & Asteroid Mining Launchpad)
    { id: 'plat-right-low', x: 1780, y: 980, w: 460, h: 32, type: 'metal' },
    { id: 'plat-right-mid', x: 1740, y: 740, w: 420, h: 28, type: 'metal' },
    { id: 'plat-right-high', x: 1900, y: 440, w: 380, h: 28, type: 'metal' },
    { id: 'plat-right-bridge', x: 1600, y: 560, w: 240, h: 24, type: 'metal' },

    // Floating wooden crates (Physical colliders drifting in zero-g)
    { id: 'crate-1', x: 780, y: 720, w: 64, h: 64, type: 'crate', angle: -0.15 },
    { id: 'crate-2', x: 1560, y: 700, w: 68, h: 68, type: 'crate', angle: 0.22 },
    { id: 'crate-3', x: 860, y: 460, w: 56, h: 56, type: 'crate', angle: 0.12 },
    { id: 'crate-4', x: 1480, y: 440, w: 60, h: 60, type: 'crate', angle: -0.18 },
    { id: 'crate-5', x: 1170, y: 220, w: 58, h: 58, type: 'crate', angle: 0.08 },
    { id: 'crate-6', x: 1680, y: 880, w: 64, h: 64, type: 'crate', angle: -0.05 },
    { id: 'crate-7', x: 650, y: 880, w: 64, h: 64, type: 'crate', angle: 0.09 },
  ],

  // Floating zero-gravity decorative elements (signs, debris, shattered window coords)
  decorations: [
    // Shattered window frame in background
    { type: 'window', x: 1200, y: 550, w: 1500, h: 800, crackCenter: { x: 740, y: 520 } },

    // Floating hazard signs
    { type: 'sign', signType: 'biohazard', x: 640, y: 680, angle: -0.25 },
    { type: 'sign', signType: 'warning', x: 1620, y: 620, angle: 0.35 },
    { type: 'sign', signType: 'gravity', x: 1100, y: 340, angle: -0.1 },
    { type: 'sign', signType: 'warning', x: 380, y: 380, angle: 0.18 },
  ],

  // Player spawn locations
  spawnPoints: [
    { x: 320, y: 650 },
    { x: 2000, y: 670 },
    { x: 1200, y: 810 },
    { x: 280, y: 370 },
    { x: 2020, y: 370 },
    { x: 1200, y: 310 },
    { x: 680, y: 500 },
    { x: 1720, y: 500 },
  ],

  // Pickups scattered across the arena (Weapons, Health, Fuel, Grenades, Ammo)
  initialPickups: [
    { id: 'pk-shotgun-1', type: PICKUP_TYPES.SHOTGUN, x: 1200, y: 840, respawnTime: 0 },
    { id: 'pk-sniper-1', type: PICKUP_TYPES.SNIPER, x: 1200, y: 340, respawnTime: 0 },
    { id: 'pk-smg-1', type: PICKUP_TYPES.SMG, x: 440, y: 680, respawnTime: 0 },
    { id: 'pk-smg-2', type: PICKUP_TYPES.SMG, x: 1940, y: 700, respawnTime: 0 },
    { id: 'pk-laser-1', type: PICKUP_TYPES.LASER, x: 580, y: 520, respawnTime: 0 },
    { id: 'pk-pistol-1', type: PICKUP_TYPES.PISTOL, x: 1620, y: 520, respawnTime: 0 },
    { id: 'pk-rifle-1', type: PICKUP_TYPES.RIFLE, x: 1020, y: 840, respawnTime: 0 },
    { id: 'pk-health-1', type: PICKUP_TYPES.HEALTH, x: 300, y: 680, respawnTime: 0 },
    { id: 'pk-health-2', type: PICKUP_TYPES.HEALTH, x: 2050, y: 700, respawnTime: 0 },
    { id: 'pk-fuel-1', type: PICKUP_TYPES.FUEL, x: 220, y: 400, respawnTime: 0 },
    { id: 'pk-fuel-2', type: PICKUP_TYPES.FUEL, x: 2100, y: 400, respawnTime: 0 },
    { id: 'pk-grenade-1', type: PICKUP_TYPES.GRENADE, x: 660, y: 520, respawnTime: 0 },
    { id: 'pk-grenade-2', type: PICKUP_TYPES.GRENADE, x: 1720, y: 520, respawnTime: 0 },
    { id: 'pk-ammo-1', type: PICKUP_TYPES.AMMO, x: 960, y: 840, respawnTime: 0 },
    { id: 'pk-ammo-2', type: PICKUP_TYPES.AMMO, x: 1440, y: 840, respawnTime: 0 },
  ],
};

module.exports = MAP;
