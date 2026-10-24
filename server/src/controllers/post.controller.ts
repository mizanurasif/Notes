import type { Request, Response } from "express";
import mongoose, { isValidObjectId } from "mongoose";
import { StatusCodes } from "http-status-codes";
import { Post } from "../models/Post.js";
import { User } from "../models/User.js";
import { getPagination } from "../utils/pagination.js";

// Posts are visible to every logged-in user; only the author can delete their own.

// GET /api/posts?page=1&limit=10  (everyone's posts, newest first)
export async function listPosts(req: Request, res: Response) {
  const { page, limit, skip } = getPagination(req);

  // Sort by _id → built-in _id index. populate does one extra find by _id for the authors.
  const [posts, total] = await Promise.all([
    Post.find()
      .select("title body author createdAt")
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate("author", "username")
      .lean(),
    Post.estimatedDocumentCount(),
  ]);

  res.json({ posts, page, limit, total, totalPages: Math.ceil(total / limit) });
}

// POST /api/posts  body: { title, body }
export async function createPost(req: Request, res: Response) {
  const { title, body } = req.body;

  if (typeof title !== "string" || typeof body !== "string") {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Title and body are required" });
  }

  // Schema validation handles empty values and max lengths
  const post = await Post.create({ title, body, author: req.user!.id });
  res.status(StatusCodes.CREATED).json({
    post: { _id: post._id, title: post.title, body: post.body, createdAt: post.createdAt },
  });
}

// PUT /api/posts/:id  body: { title?, body? }  (own posts only)
export async function updatePost(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const { title, body } = req.body;

  if ((title !== undefined && typeof title !== "string") || (body !== undefined && typeof body !== "string")) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Title and body must be text" });
  }
  if (!isValidObjectId(id)) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Post not found" });
  }

  // Matching on author too means users can only edit their own posts.
  // runValidators applies the schema rules (required, trim, maxlength) to the update.
  const post = await Post.findOneAndUpdate(
    { _id: id, author: req.user!.id },
    { title, body },
    { returnDocument: "after", runValidators: true, projection: "title body createdAt", lean: true }
  );

  if (!post) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Post not found" });
  }
  res.json({ post });
}

// DELETE /api/posts/:id  (own posts only)
export async function deletePost(req: Request, res: Response) {
  const { id } = req.params as { id: string };

  if (!isValidObjectId(id)) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Post not found" });
  }

  // Matching on author too means users can only delete their own posts
  const result = await Post.deleteOne({ _id: id, author: req.user!.id });
  if (result.deletedCount === 0) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Post not found" });
  }
  res.status(StatusCodes.NO_CONTENT).end();
}

// GET /api/posts/user/:userId?page=1&limit=10
// Scenario 2: all posts of one user, using a SINGLE aggregation pipeline with $lookup.
export async function listUserPosts(req: Request, res: Response) {
  const { userId } = req.params as { userId: string };
  const { page, limit, skip } = getPagination(req);

  if (!isValidObjectId(userId)) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "User not found" });
  }

  const [result] = await User.aggregate([
    // 1. The user, via the built-in _id index
    { $match: { _id: new mongoose.Types.ObjectId(userId) } },
    // 2. Join their posts: users._id = posts.author, via the { author: 1, _id: -1 } index
    {
      $lookup: {
        from: "posts",
        localField: "_id",
        foreignField: "author",
        // Runs on the matched posts only; sort comes from the same index 
        pipeline: [
          { $sort: { _id: -1 } },
          {
            $facet: {
              posts: [{ $skip: skip }, { $limit: limit }, { $project: { title: 1, body: 1, createdAt: 1 } }],
              total: [{ $count: "count" }],
            },
          },
        ],
        as: "result",
      },
    },
    // 3. Shape the output; only the username leaves the users collection (no email/password)
    {
      $project: {
        _id: 0,
        user: { _id: "$_id", username: "$username" },
        posts: { $first: "$result.posts" },
        total: { $ifNull: [{ $first: { $first: "$result.total.count" } }, 0] },
      },
    },
  ]);

  if (!result) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "User not found" });
  }

  res.json({ ...result, page, limit, totalPages: Math.ceil(result.total / limit) });
}

// GET /api/posts/:id  (one post in full; posts are visible to everyone)
export async function getPost(req: Request, res: Response) {
  const { id } = req.params as { id: string };

  if (!isValidObjectId(id)) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Post not found" });
  }

  // _id index; populate is one more lookup by _id for the author's username
  const post = await Post.findById(id).select("title body author createdAt").populate("author", "username").lean();
  if (!post) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "Post not found" });
  }
  res.json({ post });
}
