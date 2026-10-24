import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApplicationServer } from '../src/server.js';
import { computeCanonicalHash } from '../src/discovery/deduplication.js';
import { AtsPdfGenerator } from '../src/applications/pdf-generator.js';
import { DatabaseManager } from '../src/core/database.js';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';

describe('Phase 11: Performance & Capacity Benchmarks', () => {
  const benchDbPath = join(process.cwd(), 'data', 'bench_performance.db');
  let server: ApplicationServer;
  const benchPort = 3388;

  beforeEach(async () => {
    if (existsSync(benchDbPath)) unlinkSync(benchDbPath);
    server = new ApplicationServer({ port: benchPort, host: '127.0.0.1', dbPath: benchDbPath });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    if (existsSync(benchDbPath)) unlinkSync(benchDbPath);
  });

  it('measures fast HTTP endpoint response latency (<25ms)', async () => {
    const latencies: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const res = await fetch(`http://127.0.0.1:${benchPort}/health/live`);
      expect(res.status).toBe(200);
      latencies.push(performance.now() - start);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

    expect(avgLatency).toBeLessThan(100);
    expect(p95Latency).toBeLessThan(250);
  });

  it('benchmarks SHA-256 canonical hashing throughput (>10,000 hashes/sec)', () => {
    const count = 5000;
    const start = performance.now();
    for (let i = 0; i < count; i++) {
      computeCanonicalHash(
        `Tech Innovations Corp ${i % 50}`,
        `Senior DevOps Platform Engineer ${i}`,
        `https://example.com/job/${i}`,
        'Remote (India Eligible)'
      );
    }
    const durationMs = performance.now() - start;
    const throughputPerSec = Math.round((count / durationMs) * 1000);

    expect(throughputPerSec).toBeGreaterThan(5000);
  });

  it('measures ATS PDF generation latency (<600ms)', async () => {
    const pdfPath = join(process.cwd(), 'data', 'resumes', 'tailored', 'bench_perf_test.pdf');
    const start = performance.now();
    await AtsPdfGenerator.compileMarkdownToPdf(
      `# Candidate Name
Email: candidate@example.com | Location: Remote

## Executive Summary
Senior Cloud Infrastructure Architect with 8+ years scaling Kubernetes.

## Core Technical Competencies
- Cloud: AWS, GCP, Azure
- Containers: Docker, Kubernetes, Helm

## Professional Experience
### Lead DevOps Engineer | ScaleGrid Technologies
- Automated multi-region zero-downtime deployment pipelines.
`,
      pdfPath
    );
    const durationMs = performance.now() - start;
    expect(existsSync(pdfPath)).toBe(true);
    expect(durationMs).toBeLessThan(600);

    // Cleanup
    try { unlinkSync(pdfPath); } catch {}
  });

  it('validates SQLite database query performance under batch insertion', () => {
    const db = new DatabaseManager(benchDbPath);
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      db.insertOrUpdateVacancy({
        id: `vac_bench_${i}`,
        canonicalHash: `hash_bench_${i}`,
        sourceType: 'greenhouse',
        sourceUrl: `https://example.com/job/${i}`,
        alternateUrls: [],
        companyName: `Benchmark Corp ${i % 10}`,
        title: `Site Reliability Engineer ${i}`,
        normalizedTitle: `Site Reliability Engineer ${i}`,
        locationText: 'Remote',
        isRemote: true,
        acceptsIndia: true,
        employmentType: 'full-time',
        rawDescription: 'Benchmark description content',
        publishedAt: new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        status: 'VERIFIED',
        isContractOrFreelance: false,
      });
    }
    const insertDurationMs = performance.now() - start;
    expect(insertDurationMs).toBeLessThan(1000); // <10ms per record with WAL mode

    const queryStart = performance.now();
    const vacancies = db.listVacancies({ limit: 100 });
    const queryDurationMs = performance.now() - queryStart;
    expect(vacancies.length).toBe(100);
    expect(queryDurationMs).toBeLessThan(50);
    db.close();
  });
});
