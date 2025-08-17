import type { VercelRequest, VercelResponse } from '@vercel/node';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const swephMod = require('sweph');
const sweph = swephMod && swephMod.default ? swephMod.default : swephMod;

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    keys_count: Object.keys(sweph).length,
    has: {
      julday: typeof sweph.julday === 'function',
      swe_julday: typeof sweph.swe_julday === 'function',
      calc_ut: typeof sweph.calc_ut === 'function',
      swe_calc_ut: typeof sweph.swe_calc_ut === 'function',
      houses_ex: typeof sweph.houses_ex === 'function',
      swe_houses_ex: typeof sweph.swe_houses_ex === 'function',
      set_ephe_path: typeof sweph.set_ephe_path === 'function',
      swe_set_ephe_path: typeof sweph.swe_set_ephe_path === 'function'
    },
    constants: {
      SE_SUN: sweph.SE_SUN,
      SE_MOON: sweph.SE_MOON,
      SE_MERCURY: sweph.SE_MERCURY,
      SE_VENUS: sweph.SE_VENUS,
      SE_MARS: sweph.SE_MARS,
      SE_JUPITER: sweph.SE_JUPITER,
      SE_SATURN: sweph.SE_SATURN,
      SE_URANUS: sweph.SE_URANUS,
      SE_NEPTUNE: sweph.SE_NEPTUNE,
      SE_PLUTO: sweph.SE_PLUTO,
      SEFLG_SWIEPH: sweph.SEFLG_SWIEPH,
      SEFLG_SPEED: sweph.SEFLG_SPEED
    },
    version: sweph.version || sweph.swe_version || null
  });
}
