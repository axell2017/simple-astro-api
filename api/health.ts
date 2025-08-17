// api/health.ts - Simple health check for uptime monitoring and readiness
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    service: 'astro-positions',
    time: new Date().toISOString(),
    version: '1.0.0'
  });
}
