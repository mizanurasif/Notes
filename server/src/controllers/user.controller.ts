import type { Request, Response } from "express";
import type { PipelineStage } from "mongoose";
import { StatusCodes } from "http-status-codes";
import { INTEREST_MAX_LENGTH, MAX_INTERESTS, User } from "../models/User.js";
import { getPagination } from "../utils/pagination.js";

const PROFILE_FIELDS = "username email role interests";

// GET /api/users/me
export async function getMe(req: Request, res: Response) {
  // findById uses the built-in _id index
  const user = await User.findById(req.user!.id).select(PROFILE_FIELDS).lean();
  if (!user) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "User not found" });
  }
  res.json({ user });
}

// POST /api/users/me/interests  body: { interest: "chess" }  (adds ONE interest)
export async function addInterest(req: Request, res: Response) {
  const { interest } = req.body;

  if (typeof interest !== "string" || !interest.trim()) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "Interest is required" });
  }
  const value = interest.trim().toLowerCase();
  if (value.length > INTEREST_MAX_LENGTH) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: `Interest must be at most ${INTEREST_MAX_LENGTH} characters` });
  }

  // One atomic update by _id that only matches when:
  //  - interests: { $ne: value }  → the user doesn't already have it
  //  - "interests.9" not existing → the list has fewer than 10 items
  const user = await User.findOneAndUpdate(
    { _id: req.user!.id, interests: { $ne: value }, [`interests.${MAX_INTERESTS - 1}`]: { $exists: false } },
    { $push: { interests: value } },
    { returnDocument: "after", projection: PROFILE_FIELDS, lean: true }
  );

  if (user) return res.json({ user });

  // Nothing matched: find out which rule failed so the user gets a clear message
  const current = await User.findById(req.user!.id).select("interests").lean();
  if (!current) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "User not found" });
  }
  if (current.interests.includes(value)) {
    return res.status(StatusCodes.CONFLICT).json({ message: `You already have "${value}"` });
  }
  return res.status(StatusCodes.BAD_REQUEST).json({ message: `You can have at most ${MAX_INTERESTS} interests` });
}

// DELETE /api/users/me/interests/:interest
export async function removeInterest(req: Request, res: Response) {
  const value = String(req.params.interest).trim().toLowerCase();

  // $pull removes the value from the array in one atomic update
  const user = await User.findOneAndUpdate(
    { _id: req.user!.id },
    { $pull: { interests: value } },
    { returnDocument: "after", projection: PROFILE_FIELDS, lean: true }
  );

  if (!user) {
    return res.status(StatusCodes.NOT_FOUND).json({ message: "User not found" });
  }
  res.json({ user });
}

// GET /api/users/by-interest?page=1&limit=10&interest=chess
// Scenario 1: users grouped by interest, using exactly ONE aggregate() call
// (pagination total comes from $facet instead of a separate countDocuments).
export async function groupByInterest(req: Request, res: Response) {
  const { page, limit, skip } = getPagination(req);
  const interest = typeof req.query.interest === "string" ? req.query.interest.trim().toLowerCase() : "";

  const pipeline: PipelineStage[] = [
    // Uses the { interests: 1 } index:
    //  - with ?interest → only users who have it
    //  - without → $gt "" matches anyone with at least one interest, skipping users with none
    //    (a range the index can scan; $ne: [] would read every user)
    { $match: interest ? { interests: interest } : { interests: { $gt: "" } } },
    // Carry only what we need into the memory-heavy stages
    { $project: { username: 1, interests: 1 } },
    // One document per (user, interest)
    { $unwind: "$interests" },
    // With ?interest, drop the user's other interests so only that group is returned
    ...(interest ? [{ $match: { interests: interest } }] : []),
    // One document per interest
    {
      $group: {
        _id: "$interests",
        count: { $sum: 1 },
        users: { $push: { _id: "$_id", username: "$username" } },
      },
    },
    // Most popular first; ties by name so pages are stable
    { $sort: { count: -1, _id: 1 } },
    // Page of groups + total number of groups in the same call
    {
      $facet: {
        groups: [{ $skip: skip }, { $limit: limit }, { $project: { _id: 0, interest: "$_id", count: 1, users: 1 } }],
        total: [{ $count: "count" }],
      },
    },
  ];

  const [result] = await User.aggregate(pipeline);
  const total: number = result.total[0]?.count ?? 0;

  res.json({ groups: result.groups, page, limit, total, totalPages: Math.ceil(total / limit) });
}
