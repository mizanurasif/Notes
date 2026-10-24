import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { createPost, deletePost, getPost, listPosts, listUserPosts, updatePost } from "../controllers/post.controller.js";

const router = Router();

router.use(auth);

router.get("/", listPosts);
router.post("/", createPost);
router.get("/user/:userId", listUserPosts);
router.get("/:id", getPost);
router.put("/:id", updatePost);
router.delete("/:id", deletePost);

export default router;
