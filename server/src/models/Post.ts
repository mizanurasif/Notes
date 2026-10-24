import { Schema, model, type InferSchemaType } from "mongoose";

export const POST_TITLE_MAX = 200;
export const POST_BODY_MAX = 5000;

const postSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [POST_TITLE_MAX, `Title must be at most ${POST_TITLE_MAX} characters`],
    },
    body: {
      type: String,
      required: [true, "Body is required"],
      trim: true,
      maxlength: [POST_BODY_MAX, `Body must be at most ${POST_BODY_MAX} characters`],
    },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Scenario 2: the $lookup joins users._id → posts.author, so each lookup is an index seek
// instead of scanning every post. _id: -1 also returns a user's posts newest first without
// an in-memory sort. Also used by "delete user" (deleteMany({ author })).
postSchema.index({ author: 1, _id: -1 });

export type IPost = InferSchemaType<typeof postSchema>;

export const Post = model("Post", postSchema);
