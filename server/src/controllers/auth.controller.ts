import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { User } from "../models/User.js";
import { StatusCodes } from "http-status-codes";

function signToken(id: string, role: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set in .env");

  const expiresIn = (process.env.JWT_EXPIRES_IN || "30m") as SignOptions["expiresIn"];
  return jwt.sign({ id, role }, secret, { expiresIn });
}

export async function register(req: Request, res: Response) {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Username, email and password are required" });
  }
  if (password.length < 6) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Password must be at least 6 characters" });
  }

  const exists = await User.exists({ $or: [{ email: email.toLowerCase() }, { username }] });
  if (exists) {
    return res.status(StatusCodes.CONFLICT).json({ message: "Username or email already taken" });
  }

  const user = await User.create({ username, email, password });

  res.status(StatusCodes.CREATED).json({
    message: "Registered successfully",
    user: { id: user._id, username: user.username, email: user.email, role: user.role },
  });
}

export async function login(req: Request, res: Response) {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Username/email and password are required" });
  }

  const user = await User.findOne({
    $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
  }).select("+password");

  // Same message for both cases so we don't reveal which usernames exist
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: "Invalid credentials" });
  }

  const token = signToken(user._id.toString(), user.role);

  res.json({
    token,
    user: { id: user._id, username: user.username, email: user.email, role: user.role },
  });
}
