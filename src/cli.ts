import { ApplicationServer } from './server.js';
import { logger } from './core/logger.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'daemon';

  const server = new ApplicationServer();

  if (command === 'daemon' || command === 'serve') {
    await server.start();
    logger.info('System is running in daemon mode. Press Ctrl+C to terminate.');
    
    // Auto-start scheduler if configured in preferences
    const prefs = server.getDatabase().getPreferences();
    if (prefs?.hourlyDiscoveryEnabled) {
      server.getScheduler().start();
    }
  } else if (command === 'scan') {
    logger.info('Running manual discovery scan...');
    const result = await server.getOrchestrator().runPipeline();
    console.log('\n=== DISCOVERY SCAN RESULTS ===');
    console.log(`Total Discovered : ${result.scanReport.totalDiscovered}`);
    console.log(`New Vacancies    : ${result.scanReport.newVacancies}`);
    console.log(`Duplicate Merged : ${result.scanReport.duplicateVacancies}`);
    console.log(`Verified Active  : ${result.scanReport.verifiedActive}`);
    console.log(`India Eligible   : ${result.scanReport.indiaEligible}`);
    console.log(`Qualified (>=70) : ${result.qualifiedCount}`);
    console.log(`Drafts Prepared  : ${result.draftsPrepared}`);
    console.log(`Duration         : ${result.scanReport.durationMs}ms\n`);
    await server.stop();
  } else if (command === 'metrics') {
    const metrics = server.getDatabase().getDashboardMetrics();
    console.log('\n=== PLATFORM TELEMETRY & METRICS ===');
    console.log(JSON.stringify(metrics, null, 2));
    await server.stop();
  } else if (command === 'list') {
    const vacancies = server.getDatabase().listVacancies({ limit: 15 });
    console.log('\n=== RECENT DISCOVERED VACANCIES ===');
    for (const v of vacancies) {
      const score = v.matchScore ? `${v.matchScore.overallScore}/100 [${v.matchScore.tier}]` : 'UNSCORED';
      console.log(`• [${score}] ${v.companyName} — ${v.title} (${v.locationText}) | Status: ${v.status}`);
    }
    console.log('');
    await server.stop();
  } else {
    console.log(`Unknown command: ${command}`);
    console.log('Available commands: daemon, scan, list, metrics');
    await server.stop();
  }
}

main().catch(err => {
  logger.error(`Fatal CLI error: ${err}`);
  process.exit(1);
});
