import mongoose from 'mongoose';

let connected = false;

export async function connectDB() {
  if (connected) return;
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME?.trim();
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, dbName ? { dbName } : undefined);
  connected = true;
  console.log(`MongoDB connected${dbName ? ` (${dbName})` : ''}`);
}
