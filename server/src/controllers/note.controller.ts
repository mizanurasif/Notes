import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { StatusCodes } from "http-status-codes";
import { Note } from "../models/Note.js";
import { getPagination } from "../utils/pagination.js";

// Only the fields the client needs (_id is always included)
const NOTE_FIELDS = "title content";

// Whose notes to work on: admin routes pass :userId, normal routes always use the logged-in user.
// (:userId only exists on admin routes, which are protected by requireRole("admin"))
function getOwnerId(req: Request): string | undefined {
  const { userId } = req.params as { userId?: string };
  return userId ?? req.user?.id;
}

// GET /api/notes?page=1&limit=5
// GET /api/admin/users/:userId/notes
export async function listNotes(req: Request, res: Response) {
  const { page, limit, skip } = getPagination(req);

  const ownerId = getOwnerId(req);
  if (!ownerId) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: "Not logged in" });
  }

  const [notes, total] = await Promise.all([
    Note.find({ owner: ownerId }).select(NOTE_FIELDS).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
    Note.countDocuments({ owner: ownerId }),
  ]);
  console.log("listMyNotes")
  console.log(notes)
  res.json({ notes, page, limit, total, totalPages: Math.ceil(total / limit) });
}

// POST /api/notes
// POST /api/admin/users/:userId/notes
export async function createNote(req: Request, res: Response) {
  const { title, content } = req.body;
  //Express caps the request size at 100 KB. express.json() has a default limit: "100kb
  if (typeof title !== "string" || !title.trim()) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Title is required" });
  }
  if (content !== undefined && typeof content !== "string") {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Content must be text" });
  }
  const ownerId = getOwnerId(req);
  if (!ownerId) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: "Not logged in" });
  }
  const note = await Note.create({ title, content, owner: ownerId });
  console.log("created")
  console.log(note)
  res.status(StatusCodes.CREATED).json({
    note: { _id: note._id, title: note.title, content: note.content },
  });
}

// PUT /api/notes/:id
// PUT /api/admin/users/:userId/notes/:id
export async function updateNote(req: Request, res: Response) {
  const { id } = req.params;
  const { title, content } = req.body;

  const ownerId = getOwnerId(req);
  if (!ownerId) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: "Not logged in" });
  }
  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Title cannot be empty" });
  }
  if (content !== undefined && typeof content !== "string") {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Content must be text" });
  }
  if (!isValidObjectId(id)) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Note not found" });
  }
  // Matching on owner too means users can only update their own notes
  const note = await Note.findOneAndUpdate(
    { _id: id, owner: ownerId },
    { title, content },
    { returnDocument: "after", runValidators: true, projection: NOTE_FIELDS, lean: true }
  );

  if (!note) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Note not found" });
  }
  console.log("updated")
  console.log(note)
  res.json({ note });
}

// DELETE /api/notes/:id
// DELETE /api/admin/users/:userId/notes/:id
export async function deleteNote(req: Request, res: Response) {
  const { id } = req.params;

  const ownerId = getOwnerId(req);
  if (!ownerId) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: "Not logged in" });
  }
  if (!isValidObjectId(id)) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Note not found" });
  }

  // Matching on owner too means users can only delete their own notes
  const result = await Note.deleteOne({ _id: id, owner: ownerId });

  if (result.deletedCount === 0) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Note not found" });
  }
  res.status(StatusCodes.NO_CONTENT).end();
}
