// Index audit: seeds a throwaway MongoDB with realistic data, then explains every query the
// controllers run (same filters, sorts, projections and pipelines) and reports index usage.
// Run: npm run audit:indexes   (never touches the dev database: it starts its own mongod)
import mongoose, { type PipelineStage } from "mongoose";
import bcrypt from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import { User } from "../../src/models/User.js";
import { Note } from "../../src/models/Note.js";
import { Post } from "../../src/models/Post.js";

const MONGOD = process.env.MONGOD_BINARY || "C:/Program Files/MongoDB/Server/9.0/bin/mongod.exe";
const INTERESTS = ["chess", "music", "go", "hiking", "cooking", "reading", "football", "photography",
  "travel", "gaming", "painting", "yoga", "coding", "movies", "cycling"];

// Deterministic pseudo-random numbers, so every run gives the same data
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

// ---- explain helpers -------------------------------------------------------------------------

type Plan = { stage?: string; indexName?: string; inputStage?: Plan; inputStages?: Plan[]; queryPlan?: Plan };

function stagesOf(plan: Plan | undefined, out: string[] = []): string[] {
  if (!plan) return out;
  const p = plan.queryPlan ?? plan;
  if (p.stage) out.push(p.indexName ? `${p.stage}(${p.indexName})` : p.stage);
  if (p.inputStage) stagesOf(p.inputStage, out);
  p.inputStages?.forEach((s) => stagesOf(s, out));
  return out;
}

// Normalises find / write / aggregate explain output into one summary row
function summarize(raw: any) {
  const explain = Array.isArray(raw) ? raw[0] : raw;
  // Aggregations whose first stage is a $cursor (or a pushed-down plan) keep it under stages[0]
  const cursor = explain.stages?.[0]?.$cursor ?? explain;
  const qp = cursor.queryPlanner ?? explain.queryPlanner;
  const es = cursor.executionStats ?? explain.executionStats;
  const plan = stagesOf(qp?.winningPlan);
  const extra: Record<string, unknown> = {};
  for (const s of explain.stages ?? []) {
    const name = Object.keys(s).find((k) => k.startsWith("$"))!;
    if (name === "$lookup") {
      Object.assign(extra, {
        lookup: {
          indexesUsed: s.indexesUsed,
          collectionScans: s.collectionScans,
          totalDocsExamined: s.totalDocsExamined,
          totalKeysExamined: s.totalKeysExamined,
        },
      });
    }
  }
  const pipelineStages = (explain.stages ?? []).map((s: object) => Object.keys(s).find((k) => k.startsWith("$")));
  return {
    plan: plan.join(" ← "),
    collscan: plan.some((s) => s.startsWith("COLLSCAN")),
    inMemorySort: plan.some((s) => s === "SORT") || pipelineStages.includes("$sort"),
    keysExamined: es?.totalKeysExamined,
    docsExamined: es?.totalDocsExamined,
    nReturned: es?.nReturned,
    ...(pipelineStages.length ? { pipeline: pipelineStages.join(" → ") } : {}),
    ...extra,
  };
}

// ---- main ------------------------------------------------------------------------------------

const mongod = await MongoMemoryServer.create({ binary: { systemBinary: MONGOD, checkMD5: false } });
await mongoose.connect(mongod.getUri("notes_audit"));
await Promise.all([User.init(), Note.init(), Post.init()]); // builds exactly the schema's indexes

// 1. Index inventory: from schema.index() AND from field options (unique / index / sparse)
const inventory: Record<string, unknown> = {};
for (const model of [User, Note, Post]) {
  const fieldLevel = Object.entries(model.schema.paths)
    .filter(([, p]: [string, any]) => p.options?.index || p.options?.unique || p.options?.sparse)
    .map(([name]) => name);
  inventory[model.collection.name] = {
    inDatabase: (await model.collection.indexes()).map((i) => ({ name: i.name, key: i.key, unique: !!i.unique })),
    fromSchemaIndex: model.schema.indexes(),
    hiddenFieldLevelIndexes: fieldLevel,
  };
}

// 2. Seed: 50 users (1 admin), 500 notes, 300 posts
const hash = await bcrypt.hash("Str0ng-test-pass", 10);
const users = await User.collection.insertMany(
  Array.from({ length: 50 }, (_, i) => {
    const n = i % 9 === 0 ? 0 : 1 + Math.floor(rand() * 5); // ~11% have no interests
    return {
      username: `user${i}`,
      email: `user${i}@test.dev`,
      password: hash,
      role: i === 0 ? "admin" : "user",
      interests: [...new Set(Array.from({ length: n }, () => pick(INTERESTS)))],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  })
);
const userIds = Object.values(users.insertedIds);
// Skewed ownership: user1 is a heavy writer (≈100 notes / 60 posts), the rest share the remainder
const heavy = userIds[1];
await Note.collection.insertMany(
  Array.from({ length: 500 }, (_, i) => ({
    title: `Note ${i}`,
    content: "lorem ipsum ".repeat(1 + Math.floor(rand() * 40)),
    owner: i % 5 === 0 ? heavy : pick(userIds),
    createdAt: new Date(),
    updatedAt: new Date(),
  }))
);
await Post.collection.insertMany(
  Array.from({ length: 300 }, (_, i) => ({
    title: `Post ${i}`,
    body: "post body ".repeat(1 + Math.floor(rand() * 60)),
    author: i % 5 === 0 ? heavy : pick(userIds),
    createdAt: new Date(),
    updatedAt: new Date(),
  }))
);

const someUser = await User.findOne({ username: "user7" }).lean();
const heavyNote = await Note.findOne({ owner: heavy }).lean();
const heavyPost = await Post.findOne({ author: heavy }).lean();
const page = 3, limit = 10, skip = (page - 1) * limit; // a deeper page shows the cost of skip

const scenario1 = (interest: string): PipelineStage[] => [
  { $match: interest ? { interests: interest } : { interests: { $gt: "" } } },
  { $project: { username: 1, interests: 1 } },
  { $unwind: "$interests" },
  ...(interest ? [{ $match: { interests: interest } }] : []),
  { $group: { _id: "$interests", count: { $sum: 1 }, users: { $push: { _id: "$_id", username: "$username" } } } },
  { $sort: { count: -1, _id: 1 } },
  {
    $facet: {
      groups: [{ $skip: 0 }, { $limit: 10 }, { $project: { _id: 0, interest: "$_id", count: 1, users: 1 } }],
      total: [{ $count: "count" }],
    },
  },
];

const scenario2: PipelineStage[] = [
  { $match: { _id: heavy } },
  {
    $lookup: {
      from: "posts",
      localField: "_id",
      foreignField: "author",
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
  {
    $project: {
      _id: 0,
      user: { _id: "$_id", username: "$username" },
      posts: { $first: "$result.posts" },
      total: { $ifNull: [{ $first: { $first: "$result.total.count" } }, 0] },
    },
  },
];

const ES = "executionStats";
// Mongoose's findOneAndUpdate().explain() resolves to null, so explain the findAndModify command directly
const fam = (collection: string, query: object, update: object) =>
  mongoose.connection.db!.command({ explain: { findAndModify: collection, query, update }, verbosity: ES });
const queries: [string, string, () => Promise<unknown>][] = [
  // users
  ["auth.controller.ts:23 register exists($or email|username)", "users",
    // exists() is findOne(filter).select({ _id: 1 }); its own explain() returns null
    () => User.findOne({ $or: [{ email: "user7@test.dev" }, { username: "user7" }] }).select({ _id: 1 }).explain(ES)],
  ["auth.controller.ts:43 login findOne($or email|username)", "users",
    () => User.findOne({ $or: [{ email: "user7" }, { username: "user7" }] }).select("+password").explain(ES)],
  ["seedAdmin.ts:17 findOne({ email })", "users", () => User.findOne({ email: "user0@test.dev" }).explain(ES)],
  ["auth.ts:44 renewal findById().select(role)", "users", () => User.findById(someUser!._id).select("role").explain(ES)],
  ["admin.controller.ts:18 loadUserParam exists({ _id })", "users", () => User.findOne({ _id: someUser!._id }).select({ _id: 1 }).explain(ES)],
  ["admin.controller.ts:31 listUsers find().sort({_id:-1}).skip.limit", "users",
    () => User.find().select("username email role interests").sort({ _id: -1 }).skip(skip).limit(limit).explain(ES)],
  ["admin.controller.ts:32 / post.controller.ts:23 estimatedDocumentCount", "users",
    () => mongoose.connection.db!.command({ explain: { count: "users" }, verbosity: ES })],
  ["admin.controller.ts:40/63, user.controller.ts:12/45 findById", "users",
    () => User.findById(someUser!._id).select("username email role interests").explain(ES)],
  ["admin.controller.ts:74 save() → updateOne({ _id })", "users",
    () => User.updateOne({ _id: someUser!._id }, { $set: { username: "user7" } }).explain(ES)],
  ["admin.controller.ts:88 deleteOne({ _id })", "users", () => User.deleteOne({ _id: someUser!._id }).explain(ES)],
  ["user.controller.ts:36 addInterest findOneAndUpdate", "users",
    () => fam(
      "users",
      { _id: someUser!._id, interests: { $ne: "zzz" }, "interests.9": { $exists: false } },
      { $push: { interests: "zzz" } }
    )],
  ["user.controller.ts:60 removeInterest findOneAndUpdate({ _id })", "users",
    () => fam("users", { _id: someUser!._id }, { $pull: { interests: "zzz" } })],
  ["post.controller.ts:21 populate(author) → find({ _id: $in })", "users",
    () => User.find({ _id: { $in: userIds.slice(0, 10) } }).select("username").explain(ES)],
  ["user.controller.ts:110 SCENARIO 1 (no filter)", "users", () => User.aggregate(scenario1("")).explain(ES)],
  ["user.controller.ts:110 SCENARIO 1 (?interest=chess)", "users", () => User.aggregate(scenario1("chess")).explain(ES)],
  ["  ↳ same, forced COLLSCAN for comparison", "users",
    () => User.aggregate(scenario1("")).option({ hint: { $natural: 1 } }).explain(ES)],
  ["post.controller.ts:96 SCENARIO 2 ($lookup)", "users", () => User.aggregate(scenario2).explain(ES)],
  // notes
  ["note.controller.ts:22 / admin:108 find({ owner }).sort({_id:-1}).skip.limit", "notes",
    () => Note.find({ owner: heavy }).select("title content").sort({ _id: -1 }).skip(skip).limit(limit).explain(ES)],
  ["note.controller.ts:23 / admin:109 countDocuments({ owner })", "notes",
    () => mongoose.connection.db!.command({
      explain: { aggregate: "notes", pipeline: [{ $match: { owner: heavy } }, { $group: { _id: 1, n: { $sum: 1 } } }], cursor: {} },
      verbosity: ES,
    })],
  ["note.controller.ts:112 / admin:185 findOne({ _id, owner })", "notes",
    () => Note.findOne({ _id: heavyNote!._id, owner: heavy }).select("title content").explain(ES)],
  ["note.controller.ts:69 / admin:149 findOneAndUpdate({ _id, owner })", "notes",
    () => fam("notes", { _id: heavyNote!._id, owner: heavy }, { $set: { title: "x" } })],
  ["note.controller.ts:95 / admin:169 deleteOne({ _id, owner })", "notes",
    () => Note.deleteOne({ _id: heavyNote!._id, owner: heavy }).explain(ES)],
  ["note: ownership miss — other user's id", "notes",
    () => Note.findOne({ _id: heavyNote!._id, owner: someUser!._id }).explain(ES)],
  ["admin.controller.ts:89 deleteMany({ owner })", "notes", () => Note.deleteMany({ owner: heavy }).explain(ES)],
  // posts
  ["post.controller.ts:16 listPosts find().sort({_id:-1}).skip.limit", "posts",
    () => Post.find().select("title body author createdAt").sort({ _id: -1 }).skip(skip).limit(limit).explain(ES)],
  ["post.controller.ts:145 getPost findById", "posts", () => Post.findById(heavyPost!._id).explain(ES)],
  ["post.controller.ts:58 updatePost findOneAndUpdate({ _id, author })", "posts",
    () => fam("posts", { _id: heavyPost!._id, author: heavy }, { $set: { title: "x" } })],
  ["post.controller.ts:79 deletePost deleteOne({ _id, author })", "posts",
    () => Post.deleteOne({ _id: heavyPost!._id, author: heavy }).explain(ES)],
  ["admin.controller.ts:90 deleteMany({ author })", "posts", () => Post.deleteMany({ author: heavy }).explain(ES)],
];

const results = [];
for (const [name, coll, run] of queries) {
  const raw = await run();
  if (raw == null) throw new Error(`explain() returned nothing for: ${name}`);
  results.push({ query: name, collection: coll, ...summarize(raw) });
}

// 3. Run the read queries for real and read $indexStats: which indexes got used at all
await User.find({ $or: [{ email: "user7@test.dev" }, { username: "user7" }] });
await User.findById(someUser!._id);
await User.find().sort({ _id: -1 }).skip(skip).limit(limit);
await User.aggregate(scenario1(""));
await User.aggregate(scenario1("chess"));
await User.aggregate(scenario2);
await Note.find({ owner: heavy }).sort({ _id: -1 }).skip(skip).limit(limit);
await Note.countDocuments({ owner: heavy });
await Note.findOne({ _id: heavyNote!._id, owner: heavy });
await Post.find().sort({ _id: -1 }).skip(skip).limit(limit);
await Post.findById(heavyPost!._id);
const indexStats: Record<string, Record<string, number>> = {};
for (const model of [User, Note, Post]) {
  const stats = await model.collection.aggregate([{ $indexStats: {} }]).toArray();
  indexStats[model.collection.name] = Object.fromEntries(stats.map((s) => [s.name, Number(s.accesses.ops)]));
}

const counts = {
  users: await User.countDocuments(),
  usersWithInterests: await User.countDocuments({ "interests.0": { $exists: true } }),
  interestEntries: (await User.aggregate([{ $project: { n: { $size: "$interests" } } }, { $group: { _id: 1, n: { $sum: "$n" } } }]))[0].n,
  notes: await Note.countDocuments(),
  notesOfHeavyUser: await Note.countDocuments({ owner: heavy }),
  posts: await Post.countDocuments(),
  postsOfHeavyUser: await Post.countDocuments({ author: heavy }),
};

console.log(JSON.stringify({ counts, inventory, results, indexStats }, null, 2));

await mongoose.disconnect();
await mongod.stop();
