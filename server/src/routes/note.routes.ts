import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { createNote, deleteNote, getNote, listMyNotes, updateNote } from "../controllers/note.controller.js";

const router = Router();

router.use(auth);

router.get("/", listMyNotes);
router.post("/", createNote);
router.get("/:id", getNote);
router.put("/:id", updateNote);
router.delete("/:id", deleteNote);

export default router;
