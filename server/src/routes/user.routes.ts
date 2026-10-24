import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { addInterest, getMe, groupByInterest, removeInterest } from "../controllers/user.controller.js";

const router = Router();

router.use(auth);

router.get("/me", getMe);
router.post("/me/interests", addInterest);
router.delete("/me/interests/:interest", removeInterest);
router.get("/by-interest", groupByInterest);

export default router;
