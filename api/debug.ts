import type { VercelRequest, VercelResponse } from '@vercel/node';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const swephMod = require('sweph');
const sweph = swephMod && swephMod.default ? swephMod.default : swephMod;

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    exportKeys: Object.keys(sweph).slice(0, 30), // sample
    has_swe_julday: typeof sweph.swe_julday === 'function',
    has_swe_calc_ut: typeof sweph.swe_calc_ut === 'function',
    version: sweph?.swe_version || null
  });
}
