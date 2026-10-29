import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDb() {
  await mongoose.connect(env.mongo, { serverSelectionTimeoutMS: 20000 });
  await mongoose.syncIndexes();
  console.log('MongoDB connected');
}
