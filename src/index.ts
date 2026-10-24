import { ApplicationServer } from './server.js';
import { logger } from './core/logger.js';

async function bootstrap() {
  const server = new ApplicationServer();
  await server.start();

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT. Shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM. Shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}

bootstrap().catch(err => {
  logger.error(`Application startup error: ${err}`);
  process.exit(1);
});
