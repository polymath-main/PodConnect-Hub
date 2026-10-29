import type { Request, Response } from 'express';
import app from '../server.js';

export default function handler(req: Request, res: Response) {
  // Normalize req.url so Express routes matching /api/* are always matched
  if (req.url && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }
  (req as any).originalUrl = req.url;
  return app(req, res);
}
