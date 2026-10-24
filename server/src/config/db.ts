import mongoose from "mongoose";

// One connection per process. On Vercel the same instance serves many requests, so every
// request awaits the same promise instead of opening a new connection.
let connection: Promise<typeof mongoose> | undefined;

export function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set in .env");

  connection ??= mongoose
    .connect(uri)
    .then((m) => {
      console.log("MongoDB connected");
      return m;
    })
    .catch((err) => {
      // Forget the failed attempt so the next request tries again
      connection = undefined;
      throw err;
    });
  return connection;
}
