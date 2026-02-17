import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { createApp, gracefulShutdown } from './app';
import { connectMongo } from './infrastructure/mongo';
import { startWorker } from './modules/event';
import { logger } from './shared/logger';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main(): Promise<void> {
  try {
    // Connect to MongoDB
    await connectMongo();

    // Start the worker
    startWorker();

    // Create and start the Express app
    const app = createApp();
    const server = app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Server started');
      logger.info('Resilient Event Orchestration Gateway is running');
    });

    // Setup graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM', server));
    process.on('SIGINT', () => gracefulShutdown('SIGINT', server));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
      gracefulShutdown('uncaughtException', server);
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled rejection');
    });

  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();

