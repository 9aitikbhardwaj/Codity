import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'super_secret_distributed_scheduler_jwt_key_2026';

    jwt.verify(token, secret, (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
      }
      (req as AuthRequest).user = user as any;
      next();
    });
  } else {
    res.status(401).json({ error: 'Unauthorized: Access token is missing' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authReq = req as AuthRequest;
  if (authReq.user && authReq.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden: Admin role required' });
  }
}
