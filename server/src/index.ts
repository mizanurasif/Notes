import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import "dotenv/config";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import noteRoutes from "./routes/note.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

const app = express();
const PORT = process.env.PORT || 5000;

// exposedHeaders lets the browser read X-New-Token if the client runs on another origin
app.use(cors({ exposedHeaders: ["X-New-Token"] }));
app.use(express.json());


app.use("/api/auth", authRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/admin", adminRoutes);

// Catches errors thrown inside routes (Express 5 forwards async errors here)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  // Schema rules (required, maxlength, ...) → 400 with the first rule that failed
  if (err instanceof mongoose.Error.ValidationError) {
    const first = Object.values(err.errors)[0];
    return res.status(StatusCodes.BAD_REQUEST).json({ message: first?.message ?? "Invalid data" });
  }
  // Unique index violation (e.g. admin sets an email that is already used)
  if ("code" in err && err.code === 11000) {
    return res.status(StatusCodes.CONFLICT).json({ message: "Username or email already taken" });
  }
  // Body-parser errors: invalid JSON (400) or body over 100kb (413)
  if (err.status === StatusCodes.BAD_REQUEST) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Invalid request body" });
  }
  if (err.status === StatusCodes.REQUEST_TOO_LONG) {
    return res.status(StatusCodes.REQUEST_TOO_LONG).json({ message: "Request is too large" });
  }

  console.error(err);
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Server error" });
});

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
