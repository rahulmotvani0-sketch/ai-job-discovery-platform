import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApplicationServer } from '../src/server.js';
import { DatabaseManager } from '../src/core/database.js';
import type { Vacancy } from '../src/types/index.js';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';

describe('Advanced Filters and Saved Searches HTTP API', () => {
  const TEST_PORT = 3456;
  const TEST_DB = join(process.cwd(), 'data', 'test_filter_api.db');
  let server: ApplicationServer;

  beforeAll(async () => {
    if (existsSync(TEST_DB)) {
      try { unlinkSync(TEST_DB); } catch {}
    }

    // Seed test database
    const db = new DatabaseManager(TEST_DB);
    const v1: Vacancy = {
      id: 'vac_remote_devops',
      canonicalHash: 'hash_api_1',
      sourceType: 'remotive',
      sourceUrl: 'https://remotive.com/jobs/api-1',
      alternateUrls: [],
      companyName: 'Cloud Native Labs',
      title: 'DevOps Engineer',
      normalizedTitle: 'devops engineer',
      locationText: 'Remote, Worldwide',
      country: 'Worldwide',
      isRemote: true,
      acceptsIndia: true,
      employmentType: 'full-time',
      salaryMin: 130000,
      salaryMax: 160000,
      currency: 'USD',
      rawDescription: 'Kubernetes, AWS, Terraform, Docker, CI/CD with GitHub Actions.',
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED',
      isContractOrFreelance: false,
      workArrangement: 'remote',
      experienceLevel: 'senior',
      minExperienceYears: 5,
      visaSponsorship: true,
      isEarlyApplicant: true,
      isSaved: false
    };

    const v2: Vacancy = {
      id: 'vac_onsite_ahmedabad',
      canonicalHash: 'hash_api_2',
      sourceType: 'adzuna',
      sourceUrl: 'https://adzuna.in/jobs/api-2',
      alternateUrls: [],
      companyName: 'Gujarat Cloud Infra',
      title: 'Senior Cloud Engineer',
      normalizedTitle: 'senior cloud engineer',
      locationText: 'Ahmedabad, Gujarat, India',
      country: 'India',
      isRemote: false,
      acceptsIndia: true,
      employmentType: 'full-time',
      salaryMin: 1500000,
      salaryMax: 2000000,
      currency: 'INR',
      rawDescription: 'Cloud engineer in Ahmedabad managing AWS, Linux, Terraform.',
      publishedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: 'VERIFIED',
      isContractOrFreelance: false,
      workArrangement: 'onsite',
      experienceLevel: 'senior',
      minExperienceYears: 6,
      visaSponsorship: false,
      isEarlyApplicant: false,
      isSaved: true
    };

    db.insertOrUpdateVacancy(v1);
    db.insertOrUpdateVacancy(v2);

    db.saveMatchEvaluation({
      id: 'eval_1',
      vacancyId: v1.id,
      overallScore: 88,
      qualifies75: true,
      tier: 'Excellent',
      categoryScores: { skills: 90, experience: 85 },
      matchingSkills: ['AWS', 'Kubernetes', 'Terraform'],
      missingSkills: [],
      evidenceExplanation: 'Strong candidate profile match.',
      evaluatedAt: new Date().toISOString()
    });

    db.saveMatchEvaluation({
      id: 'eval_2',
      vacancyId: v2.id,
      overallScore: 78,
      qualifies75: true,
      tier: 'Strong',
      categoryScores: { skills: 80, experience: 75 },
      matchingSkills: ['AWS', 'Terraform'],
      missingSkills: [],
      evidenceExplanation: 'Good regional fit.',
      evaluatedAt: new Date().toISOString()
    });

    db.close();

    server = new ApplicationServer({ port: TEST_PORT, dbPath: TEST_DB });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    if (existsSync(TEST_DB)) {
      try { unlinkSync(TEST_DB); } catch {}
    }
  });

  it('GET /api/discovery/capabilities returns registry of connector filter capabilities', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/discovery/capabilities`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalConnectors).toBeGreaterThanOrEqual(10);
    expect(data.capabilities.some((c: any) => c.connectorId === 'remotive')).toBe(true);
  });

  it('GET /api/jobs/filters/options returns dynamically extracted filter options', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/jobs/filters/options`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.workArrangements).toBeDefined();
    expect(data.roles).toBeDefined();
    expect(data.cities.some((c: any) => c.name === 'Ahmedabad')).toBe(true);
  });

  it('POST /api/jobs/search filters vacancies and computes transparent exclusion statistics', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/jobs/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workArrangements: ['remote'],
        matchScore: { min: 75 }
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalMatching).toBe(1);
    expect(data.results[0].id).toBe('vac_remote_devops');
    expect(data.stats.excludedByWorkArrangement).toBe(1); // Ahmedabad onsite excluded
  });

  it('Saved Searches API supports complete lifecycle (create, list, get, update, duplicate, run, delete)', async () => {
    // 1. Create Saved Search
    const createRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/saved-searches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'test_user_api' },
      body: JSON.stringify({
        name: 'Remote DevOps Alerts',
        filters: { workArrangements: ['remote'], roles: ['DevOps Engineer'] },
        isDefault: true,
        alertsEnabled: true
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.id).toBeDefined();
    expect(created.name).toBe('Remote DevOps Alerts');
    expect(created.isDefault).toBe(true);

    // 2. List Saved Searches
    const listRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/saved-searches`, {
      headers: { 'x-user-id': 'test_user_api' }
    });
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(created.id);

    // 3. Get Single Saved Search
    const getRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/saved-searches/${created.id}`, {
      headers: { 'x-user-id': 'test_user_api' }
    });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.name).toBe('Remote DevOps Alerts');

    // 4. Update Saved Search
    const updateRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/saved-searches/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'test_user_api' },
      body: JSON.stringify({
        name: 'Updated DevOps Remote',
        alertsEnabled: false
      })
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.name).toBe('Updated DevOps Remote');
    expect(updated.alertsEnabled).toBe(false);

    // 5. Duplicate Saved Search
    const dupRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/saved-searches/${created.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'test_user_api' },
      body: JSON.stringify({ name: 'Cloned Search Profile' })
    });
    expect(dupRes.status).toBe(201);
    const cloned = await dupRes.json();
    expect(cloned.id).not.toBe(created.id);
    expect(cloned.name).toBe('Cloned Search Profile');

    // 6. Run Saved Search
    const runRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/saved-searches/${created.id}/run`, {
      method: 'POST',
      headers: { 'x-user-id': 'test_user_api' }
    });
    expect(runRes.status).toBe(200);
    const runResult = await runRes.json();
    expect(runResult.total).toBe(1);
    expect(runResult.matching[0].id).toBe('vac_remote_devops');

    // 7. Isolation Check: Another user cannot access or delete this saved search
    const unauthorizedGet = await fetch(`http://127.0.0.1:${TEST_PORT}/api/saved-searches/${created.id}`, {
      headers: { 'x-user-id': 'unauthorized_attacker' }
    });
    expect(unauthorizedGet.status).toBe(404);

    const unauthorizedDelete = await fetch(`http://127.0.0.1:${TEST_PORT}/api/saved-searches/${created.id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'unauthorized_attacker' }
    });
    expect(unauthorizedDelete.status).toBe(404);

    // 8. Delete Saved Search by owner
    const delRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/saved-searches/${created.id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'test_user_api' }
    });
    expect(delRes.status).toBe(200);

    // Verify deletion
    const verifyGet = await fetch(`http://127.0.0.1:${TEST_PORT}/api/saved-searches/${created.id}`, {
      headers: { 'x-user-id': 'test_user_api' }
    });
    expect(verifyGet.status).toBe(404);
  });
});
