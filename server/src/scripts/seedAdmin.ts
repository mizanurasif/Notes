// Creates the first admin (or promotes an existing user). Run once: npm run seed:admin
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { User } from "../models/User.js";

const { ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Set ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_PASSWORD in .env");
  process.exit(1);
}

await connectDB();

try {
  const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });

  if (existing) {
    existing.role = "admin";
    await existing.save();
    console.log(`Promoted "${existing.username}" to admin`);
  } else {
    // create() runs the pre("save") hook, so the password gets hashed
    await User.create({ username: ADMIN_USERNAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: "admin" });
    console.log(`Admin "${ADMIN_USERNAME}" created`);
  }
} catch (err) {
  console.error("Failed to seed admin:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
