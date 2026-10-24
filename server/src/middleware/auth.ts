import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import { User } from "../models/User.js";
import { signToken } from "../utils/token.js";

export interface AuthUser {
  id: string;
  role: "user" | "admin";
}

// Adds req.user to Express's Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Verifies "Authorization: Bearer <token>" and puts the payload on req.user
export async function auth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: "No token provided" });
  }

  let payload: AuthUser & JwtPayload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as AuthUser & JwtPayload;
    console.log(payload)
  } catch {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: "Invalid or expired token" });
  }
  req.user = { id: payload.id, role: payload.role };

  // Sliding expiration: once less than half the lifetime is left (15 of 30 min),
  // send a fresh token in the X-New-Token header so active users stay logged in.
  const now = Date.now() / 1000;
  const lifetime = payload.exp! - payload.iat!;
  if (payload.exp! - now < lifetime / 2) {
    // Re-read the user (by _id index) so the new token has their current role,
    // and a deleted user can't keep renewing
    const user = await User.findById(payload.id).select("role").lean();
    if (!user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: "User no longer exists" });
    }
    req.user.role = user.role;
    res.setHeader("X-New-Token", signToken(payload.id, user.role));
  }

  next();
}

// Use after auth: only lets the given role through
export function requireRole(role: AuthUser["role"]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: "Forbidden" });
    }
    next();
  };
}
