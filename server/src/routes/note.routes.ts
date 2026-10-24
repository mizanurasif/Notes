import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { createNote, deleteNote, listNotes, updateNote } from "../controllers/note.controller.js";

const router = Router();

router.use(auth);

router.get("/", listNotes);
router.post("/", createNote);
router.put("/:id", updateNote);
router.delete("/:id", deleteNote);

export default router;
