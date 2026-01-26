import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod;

export async function startMemoryServer() {
  mongod = await MongoMemoryServer.create({ binary: { version: '6.0.6' } });
  const uri = mongod.getUri();
  await mongoose.disconnect();
  await mongoose.connect(uri, { autoIndex: true });
  return uri;
}

export async function stopMemoryServer() {
  if (mongoose.connection.readyState) {
    await mongoose.disconnect();
  }
  if (mongod) await mongod.stop();
}
