import { Schema, model, type InferSchemaType } from "mongoose";

const noteSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [200, "Title must be at most 200 characters"],
    },
    content: {
      type: String,
      default: "",
      maxlength: [10000, "Content must be at most 10000 characters"],
    },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// A user's notes list: filter by owner, newest first (_id grows with creation time).
// Also covers countDocuments({ owner }) for pagination and { _id, owner } lookups.
noteSchema.index({ owner: 1, _id: -1 });

export type INote = InferSchemaType<typeof noteSchema>;

export const Note = model("Note", noteSchema);
