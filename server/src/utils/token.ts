import jwt, { type SignOptions } from "jsonwebtoken";

export function signToken(id: string, role: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set in .env");

  const expiresIn = (process.env.JWT_EXPIRES_IN || "30m") as SignOptions["expiresIn"];
  return jwt.sign({ id, role }, secret, { expiresIn });
}
