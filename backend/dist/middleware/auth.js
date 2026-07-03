"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateJWT = authenticateJWT;
exports.requireAdmin = requireAdmin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        const secret = process.env.JWT_SECRET || 'super_secret_distributed_scheduler_jwt_key_2026';
        jsonwebtoken_1.default.verify(token, secret, (err, user) => {
            if (err) {
                return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
            }
            req.user = user;
            next();
        });
    }
    else {
        res.status(401).json({ error: 'Unauthorized: Access token is missing' });
    }
}
function requireAdmin(req, res, next) {
    const authReq = req;
    if (authReq.user && authReq.user.role === 'admin') {
        next();
    }
    else {
        res.status(403).json({ error: 'Forbidden: Admin role required' });
    }
}
