/* BACKROOMS — the levels. Clearing one drops you into the next, each with its own look, light and layout. */
window.BR = window.BR || {};

(function (BR) {
  BR.themes = [
    {
      id: 0, name: 'LEVEL 0', title: 'THE LOBBY', sub: 'yellow wallpaper, damp carpet, a hum that never stops',
      wall: 'wall', floor: 'carpet', ceil: 'ceiling', wallTint: 0xffffff, floorTint: 0xffffff, ceilTint: 0xffffff, floorRough: 1, floorMetal: 0,
      bg: 0x120f04, fog: [0x1a1505, 0.058], ambient: [0x4a4222, 0.4],
      light: { pool: 0xfff0b4, mul: [1, 1, 0.82], int: 1 }, fx: { dead: 0.12, flaky: 0.16, keep: 1 },
      maze: { loop: 0.12, halls: 8, sizes: [7, 9, 11, 13], pillars: 0.6 }, entity: 1, office: true,
      trim: [0x2b2412, 0xcbbd7a], roomTint: 0xdcd0b4
    },
    {
      id: 1, name: 'LEVEL 1', title: 'THE GARAGE', sub: 'concrete, pillars, far too few lights',
      wall: 'concrete', floor: 'concrete', ceil: 'concrete', wallTint: 0xd6d8dc, floorTint: 0x8c8e92, ceilTint: 0x9a9ca0, floorRough: 0.75, floorMetal: 0,
      bg: 0x06090a, fog: [0x0a1011, 0.068], ambient: [0x1d2628, 0.38],
      light: { pool: 0xd4efe0, mul: [0.85, 1, 0.92], int: 1.05 }, fx: { dead: 0.2, flaky: 0.2, keep: 0.6 },
      maze: { loop: 0.26, halls: 10, sizes: [9, 11, 13, 15], pillars: 0.95 }, entity: 1.08, office: false,
      trim: [0x2c2e30, 0x55575a], roomTint: 0xb8babd
    },
    {
      id: 2, name: 'LEVEL 2', title: 'PIPE DREAMS', sub: 'rust, steam and a red emergency glow',
      wall: 'metal', floor: 'steel', ceil: 'metal', wallTint: 0xd8c0a8, floorTint: 0xb0a8a0, ceilTint: 0x6e5646, floorRough: 0.55, floorMetal: 0.35,
      bg: 0x120704, fog: [0x1c0b05, 0.082], ambient: [0x351808, 0.34],
      light: { pool: 0xff9a5a, mul: [1, 0.5, 0.3], int: 1.15 }, fx: { dead: 0.24, flaky: 0.26, keep: 0.8 },
      maze: { loop: 0.03, halls: 4, sizes: [7, 9], pillars: 0.35 }, entity: 1.16, office: false,
      trim: [0x1f1612, 0x3a2a20], roomTint: 0xc8a888
    },
    {
      id: 3, name: 'LEVEL 3', title: 'THE POOLROOMS', sub: 'white tile, still air, nowhere to hide',
      wall: 'tiles', floor: 'tiles', ceil: 'tiles', wallTint: 0xffffff, floorTint: 0xe8f6f6, ceilTint: 0xf2fbfb, floorRough: 0.18, floorMetal: 0.08,
      bg: 0x7fb9b8, fog: [0x76b4b3, 0.034], ambient: [0x8ac4c4, 0.62],
      light: { pool: 0xd8ffff, mul: [0.8, 1, 1], int: 1.25 }, fx: { dead: 0.04, flaky: 0.04, keep: 1 },
      maze: { loop: 0.2, halls: 9, sizes: [11, 13, 15], pillars: 0.85 }, entity: 1.25, office: false,
      trim: [0x9bbcbc, 0xc9e2e2], roomTint: 0xe8f4f4
    }
  ];
  // the drains under the parkour hall: not part of the level list, you only get here by falling
  BR.underTheme = {
    id: 4, name: 'UNDERGROUND', title: 'THE DRAINS', sub: 'find the ladder up',
    wall: 'concrete', floor: 'concrete', ceil: 'concrete', wallTint: 0x8f9a96, floorTint: 0x5e6864, ceilTint: 0x6c7470, floorRough: 0.3, floorMetal: 0.1,
    bg: 0x020504, fog: [0x040a08, 0.085], ambient: [0x0f1c18, 0.3],
    light: { pool: 0x9fffd0, mul: [0.7, 1, 0.85], int: 0.95 }, fx: { dead: 0.32, flaky: 0.26, keep: 1 },
    maze: { loop: 0.04, halls: 2, sizes: [7], pillars: 0.9, noCourse: true }, entity: 0.85, office: false, under: true,
    trim: [0x1c2220, 0x3d4743], roomTint: 0x8f9a96
  };
})(window.BR);
