import type { NextFunction, Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { StatusCodes } from "http-status-codes";
import { User } from "../models/User.js";
import { Note } from "../models/Note.js";
import { getPagination } from "../utils/pagination.js";

// Never send the password hash (it's select: false anyway)
const USER_FIELDS = "username email role";

function toUserResponse(user: { _id: unknown; username: string; email: string; role: string }) {
  return { _id: user._id, username: user.username, email: user.email, role: user.role };
}

// Runs for every admin route with :userId: 404 early if the user doesn't exist
export async function loadUserParam(req: Request, res: Response, next: NextFunction, userId: string) {
  if (!isValidObjectId(userId) || !(await User.exists({ _id: userId }))) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "User not found" });
  }
  next();
}

// GET /api/admin/users?page=1&limit=10
export async function listUsers(req: Request, res: Response) {
  const { page, limit, skip } = getPagination(req);

  // Newest first by _id → uses the built-in _id index, no extra index needed.
  // estimatedDocumentCount reads collection metadata instead of scanning every user.
  const [users, total] = await Promise.all([
    User.find().select(USER_FIELDS).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
    User.estimatedDocumentCount(),
  ]);

  res.json({ users, page, limit, total, totalPages: Math.ceil(total / limit) });
}

// GET /api/admin/users/:userId
export async function getUser(req: Request, res: Response) {
  const user = await User.findById(req.params.userId).select(USER_FIELDS).lean();
  res.json({ user });
}

// POST /api/admin/users
export async function createUser(req: Request, res: Response) {
  const { username, email, password, role } = req.body;

  // Schema validation (required, minlength, enum) and the unique indexes do the checking
  const user = await User.create({ username, email, password, role });
  res.status(StatusCodes.CREATED).json({ user: toUserResponse(user) });
}

// PUT /api/admin/users/:userId  (every field optional; empty password = keep current one)
export async function updateUser(req: Request, res: Response) {
  const { userId } = req.params;
  const { username, email, password, role } = req.body;

  if (userId === req.user!.id && role !== undefined && role !== "admin") {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "You cannot remove your own admin role" });
  }

  // findById + save (not findByIdAndUpdate) so the pre("save") hook hashes a new password
  const user = await User.findById(userId);
  if (!user) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "User not found" });
  }

  if (username !== undefined) user.username = username;
  if (email !== undefined) user.email = email;
  if (role !== undefined) user.role = role;
  if (password) user.password = password;

  await user.save();
  res.json({ user: toUserResponse(user) });
}

// DELETE /api/admin/users/:userId  (also deletes their notes)
export async function deleteUser(req: Request, res: Response) {
  const { userId } = req.params;

  if (userId === req.user!.id) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "You cannot delete yourself" });
  }

  // deleteMany({ owner }) uses the { owner, _id } index
  await Promise.all([User.deleteOne({ _id: userId }), Note.deleteMany({ owner: userId })]);
  res.status(StatusCodes.NO_CONTENT).end();
}
