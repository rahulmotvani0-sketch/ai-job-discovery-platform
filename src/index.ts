import { ApplicationServer } from './server.js';
import { logger } from './core/logger.js';

async function bootstrap() {
  const server = new ApplicationServer();
  await server.start();

  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}. Draining background jobs and shutting down gracefully...`);
    try {
      await server.stop();
      logger.info('Clean shutdown completed.');
      process.exit(0);
    } catch (err: any) {
      logger.error(`Error during graceful shutdown: ${err.message || err}`);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled Promise Rejection: ${reason}`);
  });

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message || err}`, { stack: err.stack });
    gracefulShutdown('uncaughtException').finally(() => process.exit(1));
  });
}

bootstrap().catch(err => {
  logger.error(`Application startup error: ${err.message || err}`);
  process.exit(1);
});
