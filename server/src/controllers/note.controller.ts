import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { StatusCodes } from "http-status-codes";
import { Note } from "../models/Note.js";
import { getPagination } from "../utils/pagination.js";

// Normal-user note routes: always work on the logged-in user's own notes (req.user.id).
// Admin access to other users' notes lives in admin.controller.ts.

// Only the fields the client needs (_id is always included)
const NOTE_FIELDS = "title content";

// GET /api/notes?page=1&limit=5
export async function listMyNotes(req: Request, res: Response) {
  const { page, limit, skip } = getPagination(req);

  if (!req.user) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: "Not logged in" });
  }

  const [notes, total] = await Promise.all([
    Note.find({ owner: req.user.id }).select(NOTE_FIELDS).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
    Note.countDocuments({ owner: req.user.id }),
  ]);
  console.log("listMyNotes")
  console.log(notes)
  res.json({ notes, page, limit, total, totalPages: Math.ceil(total / limit) });
}

// POST /api/notes
export async function createNote(req: Request, res: Response) {
  const { title, content } = req.body;
  //Express caps the request size at 100 KB. express.json() has a default limit: "100kb
  if (typeof title !== "string" || !title.trim()) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Title is required" });
  }
  if (content !== undefined && typeof content !== "string") {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Content must be text" });
  }
  if (!req.user) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: "Not logged in" });
  }
  const note = await Note.create({ title, content, owner: req.user.id });
  console.log("created")
  console.log(note)
  res.status(StatusCodes.CREATED).json({
    note: { _id: note._id, title: note.title, content: note.content },
  });
}

// PUT /api/notes/:id
export async function updateNote(req: Request, res: Response) {
  const { id } = req.params;
  const { title, content } = req.body;

  if (!req.user) {
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
    { _id: id, owner: req.user.id },
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
export async function deleteNote(req: Request, res: Response) {
  const { id } = req.params;

  if (!req.user) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: "Not logged in" });
  }
  if (!isValidObjectId(id)) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Note not found" });
  }

  // Matching on owner too means users can only delete their own notes
  const result = await Note.deleteOne({ _id: id, owner: req.user.id });

  if (result.deletedCount === 0) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Note not found" });
  }
  res.status(StatusCodes.NO_CONTENT).end();
}

// GET /api/notes/:id  (one of your own notes, full title and content)
export async function getNote(req: Request, res: Response) {
  const { id } = req.params as { id: string };

  if (!isValidObjectId(id)) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Note not found" });
  }

  // { _id, owner }: found by the _id index; owner makes sure it's your note
  const note = await Note.findOne({ _id: id, owner: req.user!.id }).select(NOTE_FIELDS).lean();
  if (!note) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Note not found" });
  }
  res.json({ note });
}
