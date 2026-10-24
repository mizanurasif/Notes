import type { NextFunction, Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { StatusCodes } from "http-status-codes";
import { User } from "../models/User.js";
import { Note } from "../models/Note.js";
import { getPagination } from "../utils/pagination.js";

// Never send the password hash (it's select: false anyway)
const USER_FIELDS = "username email role interests";

function toUserResponse(user: { _id: unknown; username: string; email: string; role: string; interests: string[] }) {
  return { _id: user._id, username: user.username, email: user.email, role: user.role, interests: user.interests };
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
  const { username, email, password, role, interests } = req.body;

  // Schema validation (required, minlength, enum) and the unique indexes do the checking
  const user = await User.create({ username, email, password, role, interests });
  res.status(StatusCodes.CREATED).json({ user: toUserResponse(user) });
}

// PUT /api/admin/users/:userId  (every field optional; empty password = keep current one)
export async function updateUser(req: Request, res: Response) {
  const { userId } = req.params as { userId: string };
  const { username, email, password, role, interests } = req.body;

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
  if (interests !== undefined) user.interests = interests;
  if (password) user.password = password;

  await user.save();
  res.json({ user: toUserResponse(user) });
}

// DELETE /api/admin/users/:userId  (also deletes their notes)
export async function deleteUser(req: Request, res: Response) {
  const { userId } = req.params as { userId: string };

  if (userId === req.user!.id) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "You cannot delete yourself" });
  }

  // deleteMany({ owner }) uses the { owner, _id } index
  await Promise.all([User.deleteOne({ _id: userId }), Note.deleteMany({ owner: userId })]);
  res.status(StatusCodes.NO_CONTENT).end();
}

// ---- A user's notes (admin only) ----
// Separate from note.controller.ts: the owner always comes from :userId (checked by loadUserParam),
// never from the logged-in admin.

const NOTE_FIELDS = "title content";

// GET /api/admin/users/:userId/notes?page=1&limit=5
export async function listUserNotes(req: Request, res: Response) {
  const { userId } = req.params as { userId: string };
  const { page, limit, skip } = getPagination(req);

  // Same { owner, _id } index as a user listing their own notes
  const [notes, total] = await Promise.all([
    Note.find({ owner: userId }).select(NOTE_FIELDS).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
    Note.countDocuments({ owner: userId }),
  ]);

  res.json({ notes, page, limit, total, totalPages: Math.ceil(total / limit) });
}

// POST /api/admin/users/:userId/notes
export async function createUserNote(req: Request, res: Response) {
  const { userId } = req.params as { userId: string };
  const { title, content } = req.body;

  if (typeof title !== "string" || !title.trim()) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Title is required" });
  }
  if (content !== undefined && typeof content !== "string") {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Content must be text" });
  }

  const note = await Note.create({ title, content, owner: userId });
  res.status(StatusCodes.CREATED).json({
    note: { _id: note._id, title: note.title, content: note.content },
  });
}

// PUT /api/admin/users/:userId/notes/:noteId
export async function updateUserNote(req: Request, res: Response) {
  const { userId, noteId } = req.params as { userId: string; noteId: string };
  const { title, content } = req.body;

  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Title cannot be empty" });
  }
  if (content !== undefined && typeof content !== "string") {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Content must be text" });
  }
  if (!isValidObjectId(noteId)) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Note not found" });
  }

  // Matching on owner too: the note must belong to :userId
  const note = await Note.findOneAndUpdate(
    { _id: noteId, owner: userId },
    { title, content },
    { returnDocument: "after", runValidators: true, projection: NOTE_FIELDS, lean: true }
  );

  if (!note) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Note not found" });
  }
  res.json({ note });
}

// DELETE /api/admin/users/:userId/notes/:noteId
export async function deleteUserNote(req: Request, res: Response) {
  const { userId, noteId } = req.params as { userId: string; noteId: string };

  if (!isValidObjectId(noteId)) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Note not found" });
  }

  const result = await Note.deleteOne({ _id: noteId, owner: userId });

  if (result.deletedCount === 0) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Note not found" });
  }
  res.status(StatusCodes.NO_CONTENT).end();
}
