import { Schema, model, type InferSchemaType } from "mongoose";
import bcrypt from "bcryptjs";

export const MAX_INTERESTS = 10;
export const INTEREST_MAX_LENGTH = 30;

const userSchema = new Schema(
  {
    username: { type: String, required: [true, "Username is required"], trim: true },
    email: { type: String, required: [true, "Email is required"], trim: true, lowercase: true },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: { values: ["user", "admin"], message: "Role must be user or admin" },
      default: "user",
    },
    interests: {
      type: [String],
      default: [],
      // Trim, lowercase, drop empties and duplicates, so "Chess " and "chess" are the same interest
      set: (list: unknown) =>
        Array.isArray(list)
          ? [...new Set(list.map((s) => String(s).trim().toLowerCase()).filter(Boolean))]
          : list,
      validate: {
        validator: (list: string[]) => list.length <= MAX_INTERESTS && list.every((s) => s.length <= INTEREST_MAX_LENGTH),
        message: `Up to ${MAX_INTERESTS} interests, each at most ${INTEREST_MAX_LENGTH} characters`,
      },
    },
  },
  { timestamps: true }
);

// Login looks up by email OR username, and both must be unique (Tells MongoDB to reject any new documents that contain a duplicate email addres)
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });

// Group-by-interests aggregation: multikey index (one entry per interest per user).
// Lets the first $match skip users with no interests, and makes ?interest=chess read only chess users.
userSchema.index({ interests: 1 });

// Hash the password whenever it is set or changed
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 10);
});

export type IUser = InferSchemaType<typeof userSchema>;

export const User = model("User", userSchema);
