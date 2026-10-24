import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import { DiscoveryManager } from '../src/discovery/connectors/manager.js';
import type { RawJobPayload } from '../src/types/index.js';

describe('NextRaise-Inspired Discovery & UX Engine', () => {
  let db: DatabaseManager;
  let discoveryManager: DiscoveryManager;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
    discoveryManager = new DiscoveryManager(db);
  });

  it('detects early applicant status for jobs published within 48 hours', () => {
    const now = Date.now();

    // 1. Posted 6 hours ago -> Early applicant
    const recentPayload: RawJobPayload = {
      sourceId: 'job_recent',
      sourceType: 'remoteok',
      sourceUrl: 'https://remoteok.com/j/recent',
      companyName: 'EarlyTech Inc',
      title: 'DevOps Engineer',
      locationText: 'Remote - India',
      rawDescription: 'DevOps role with Kubernetes and Terraform experience required.',
      publishedAt: new Date(now - 6 * 3600 * 1000).toISOString(),
    };
    const { vacancy: recentVac } = discoveryManager.processRawPayload(recentPayload);
    expect(recentVac.isEarlyApplicant).toBe(true);

    // 2. Posted 5 days ago -> Standard vacancy
    const olderPayload: RawJobPayload = {
      sourceId: 'job_older',
      sourceType: 'remoteok',
      sourceUrl: 'https://remoteok.com/j/older',
      companyName: 'OlderTech Corp',
      title: 'Platform Engineer',
      locationText: 'Remote - India',
      rawDescription: 'Platform Engineer with AWS and ArgoCD.',
      publishedAt: new Date(now - 5 * 24 * 3600 * 1000).toISOString(),
    };
    const { vacancy: olderVac } = discoveryManager.processRawPayload(olderPayload);
    expect(olderVac.isEarlyApplicant).toBe(false);
  });

  it('normalizes country and role category taxonomy accurately', () => {
    // India DevOps
    const payload1: RawJobPayload = {
      sourceId: 'p1',
      sourceType: 'jobicy',
      sourceUrl: 'https://jobicy.com/j/1',
      companyName: 'Bangalore Infra Ltd',
      title: 'Senior DevOps Engineer',
      locationText: 'Bengaluru, India',
      rawDescription: 'Manage AWS infrastructure with Terraform.',
      publishedAt: new Date().toISOString(),
    };
    const { vacancy: v1 } = discoveryManager.processRawPayload(payload1);
    expect(v1.country).toBe('India');
    expect(v1.category).toBe('DevOps');

    // SRE in Germany
    const payload2: RawJobPayload = {
      sourceId: 'p2',
      sourceType: 'jobicy',
      sourceUrl: 'https://jobicy.com/j/2',
      companyName: 'Berlin Cloud GmbH',
      title: 'Site Reliability Engineer (SRE)',
      locationText: 'Berlin, Germany',
      rawDescription: 'Site reliability and Prometheus observability.',
      publishedAt: new Date().toISOString(),
    };
    const { vacancy: v2 } = discoveryManager.processRawPayload(payload2);
    expect(v2.country).toBe('Germany');
    expect(v2.category).toBe('SRE');

    // DevSecOps in United States
    const payload3: RawJobPayload = {
      sourceId: 'p3',
      sourceType: 'jobicy',
      sourceUrl: 'https://jobicy.com/j/3',
      companyName: 'CyberGuard Inc',
      title: 'Lead DevSecOps Engineer',
      locationText: 'Austin, Texas, United States',
      rawDescription: 'Security automation and container hardening.',
      publishedAt: new Date().toISOString(),
    };
    const { vacancy: v3 } = discoveryManager.processRawPayload(payload3);
    expect(v3.country).toBe('United States');
    expect(v3.category).toBe('DevSecOps');
  });

  it('supports bookmarking and saving vacancies', () => {
    const payload: RawJobPayload = {
      sourceId: 'star_test',
      sourceType: 'remoteok',
      sourceUrl: 'https://remoteok.com/j/star',
      companyName: 'StarTech',
      title: 'Cloud Architect',
      locationText: 'Remote',
      rawDescription: 'Cloud architecture with multi-cloud GCP and AWS.',
      publishedAt: new Date().toISOString(),
    };
    const { vacancy } = discoveryManager.processRawPayload(payload);
    expect(vacancy.isSaved).toBe(false);

    // Toggle save to true
    db.toggleSaveVacancy(vacancy.id, true);
    const savedVac = db.getVacancyById(vacancy.id);
    expect(savedVac?.isSaved).toBe(true);

    // Check listVacancies filter with isSaved: true
    const savedList = db.listVacancies({ isSaved: true });
    expect(savedList).toHaveLength(1);
    expect(savedList[0].id).toBe(vacancy.id);

    // Toggle save back to false
    db.toggleSaveVacancy(vacancy.id, false);
    const unSavedList = db.listVacancies({ isSaved: true });
    expect(unSavedList).toHaveLength(0);
  });

  it('filters vacancies by country, category, and text keywords', () => {
    // Insert 3 distinct vacancies
    discoveryManager.processRawPayload({
      sourceId: 'f1',
      sourceType: 'jobicy',
      sourceUrl: 'https://jobicy.com/f1',
      companyName: 'Fintech India',
      title: 'Kubernetes Platform Engineer',
      locationText: 'Mumbai, India',
      rawDescription: 'Deploy and manage EKS clusters with Helm.',
      publishedAt: new Date().toISOString(),
    });

    discoveryManager.processRawPayload({
      sourceId: 'f2',
      sourceType: 'jobicy',
      sourceUrl: 'https://jobicy.com/f2',
      companyName: 'London SRE Labs',
      title: 'Site Reliability Engineer',
      locationText: 'London, United Kingdom',
      rawDescription: 'Observability and incident management.',
      publishedAt: new Date().toISOString(),
    });

    // Filter by country = India
    const indiaList = db.listVacancies({ country: 'India' });
    expect(indiaList.length).toBeGreaterThanOrEqual(1);
    expect(indiaList.every(v => v.country === 'India' || v.acceptsIndia)).toBe(true);

    // Filter by category = SRE
    const sreList = db.listVacancies({ category: 'SRE' });
    expect(sreList.length).toBe(1);
    expect(sreList[0].companyName).toBe('London SRE Labs');

    // Filter by search keyword "Helm"
    const helmList = db.listVacancies({ search: 'Helm' });
    expect(helmList.length).toBe(1);
    expect(helmList[0].companyName).toBe('Fintech India');
  });
});
