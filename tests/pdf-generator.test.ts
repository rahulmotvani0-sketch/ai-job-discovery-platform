import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { AtsPdfGenerator } from '../src/applications/pdf-generator.js';
import { DEFAULT_USER_PROFILE } from '../src/core/profile.js';

describe('AtsPdfGenerator', () => {
  it('compiles Markdown resume into a valid, parseable ATS PDF file', async () => {
    const testPdfPath = join(process.cwd(), 'data', 'resumes', 'tailored', 'test_ats_sample.pdf');
    const sampleMarkdown = `
# ALEX RIVERS
**Staff Software Engineer | Distributed Systems & Cloud**
San Francisco, CA · alex.rivers@example.com · +1 (555) 234-5678
[Portfolio](https://example.com) · [GitHub](https://github.com/example) · [LinkedIn](https://linkedin.com/in/example)

---

## PROFESSIONAL SUMMARY
Seasoned Software Engineer with 8+ years architecting fault-tolerant microservices, distributed streaming systems, and multi-region Kubernetes deployments.

---

## TARGETED TECHNICAL COMPETENCIES
**Cloud Platforms:** AWS (EKS, RDS, S3), GCP (GKE, BigQuery)
**Languages & Frameworks:** Go, TypeScript, Python, Node.js, React
**Containers & Orchestration:** Docker, Kubernetes, Helm, ArgoCD
**Observability:** Prometheus, Grafana, OpenTelemetry, Datadog

---

## PROFESSIONAL EXPERIENCE
### Lead Systems Architect — CloudScale Inc
**2021 – Present** | Remote
- Designed event-driven messaging backbone reducing 99th percentile processing latency by 45%.
- Automated infrastructure provisioning with Terraform across 12 production clusters.

### Senior Backend Engineer — FinTech Labs
**2018 – 2021** | New York, NY
- Built high-throughput transaction pipeline processing $20M+ in daily volume with zero data loss.
- Implemented comprehensive CI/CD pipelines with GitHub Actions and automated regression gates.

---

## EDUCATION & CERTIFICATIONS
- **B.S. in Computer Science**, Tech University (2018)
- AWS Certified Solutions Architect - Professional
    `.trim();

    const resultPath = await AtsPdfGenerator.compileMarkdownToPdf(sampleMarkdown, testPdfPath);
    expect(existsSync(resultPath)).toBe(true);

    const pdfBuffer = readFileSync(resultPath);
    expect(pdfBuffer.length).toBeGreaterThan(1500);
    // Standard PDF header signature check '%PDF-'
    expect(pdfBuffer.toString('utf-8', 0, 5)).toBe('%PDF-');

    // Clean up test file
    try { unlinkSync(resultPath); } catch {}
  });

  it('generates an ATS PDF directly from structured UserProfile', async () => {
    const testPdfPath = join(process.cwd(), 'data', 'resumes', 'tailored', 'test_profile_sample.pdf');
    const resultPath = await AtsPdfGenerator.generateFromProfile(DEFAULT_USER_PROFILE, undefined, {
      outputPath: testPdfPath,
      title: 'Full-Stack & Cloud Platform Engineer',
    });

    expect(existsSync(resultPath)).toBe(true);
    const pdfBuffer = readFileSync(resultPath);
    expect(pdfBuffer.length).toBeGreaterThan(1500);
    expect(pdfBuffer.toString('utf-8', 0, 5)).toBe('%PDF-');

    // Clean up
    try { unlinkSync(resultPath); } catch {}
  });
});
