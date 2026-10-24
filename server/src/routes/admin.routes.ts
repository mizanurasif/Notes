import { Router } from "express";
import { auth, requireRole } from "../middleware/auth.js";
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  loadUserParam,
  updateUser,
} from "../controllers/admin.controller.js";
import { createNote, deleteNote, listNotes, updateNote } from "../controllers/note.controller.js";

const router = Router();

// 401 if not logged in, 403 if not an admin
router.use(auth, requireRole("admin"));

// Checks :userId exists before any route below that uses it
router.param("userId", loadUserParam);

// Manage users
router.get("/users", listUsers);
router.post("/users", createUser);
router.get("/users/:userId", getUser);
router.put("/users/:userId", updateUser);
router.delete("/users/:userId", deleteUser);

// A user's notes: same controllers as /api/notes, but for :userId instead of the logged-in admin
router.get("/users/:userId/notes", listNotes);
router.post("/users/:userId/notes", createNote);
router.put("/users/:userId/notes/:id", updateNote);
router.delete("/users/:userId/notes/:id", deleteNote);

export default router;
