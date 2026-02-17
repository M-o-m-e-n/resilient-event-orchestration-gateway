import mongoose from 'mongoose';
import { logger } from '../../shared/logger';

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/event-gateway';

const mongoOptions: mongoose.ConnectOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

/**
 * Connect to MongoDB
 */
export async function connectMongo(): Promise<void> {
  try {
    await mongoose.connect(mongoUri, mongoOptions);
    logger.info('MongoDB connected');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection failed');
    throw error;
  }
}

mongoose.connection.on('error', (err) => {
  logger.error({ err }, 'MongoDB connection error');
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
});

/**
 * Check MongoDB health
 */
export function isMongoHealthy(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Close MongoDB connection gracefully
 */
export async function closeMongo(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

export { mongoose };

