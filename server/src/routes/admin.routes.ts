import { Router } from "express";
import { auth, requireRole } from "../middleware/auth.js";
import {
  createUser,
  createUserNote,
  deleteUser,
  deleteUserNote,
  getUser,
  getUserNote,
  listUserNotes,
  listUsers,
  loadUserParam,
  updateUser,
  updateUserNote,
} from "../controllers/admin.controller.js";

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

// A user's notes (admin controllers, separate from /api/notes)
router.get("/users/:userId/notes", listUserNotes);
router.post("/users/:userId/notes", createUserNote);
router.get("/users/:userId/notes/:noteId", getUserNote);
router.put("/users/:userId/notes/:noteId", updateUserNote);
router.delete("/users/:userId/notes/:noteId", deleteUserNote);

export default router;
