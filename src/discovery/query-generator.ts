import type { JobPreferences, UserProfile } from '../types/index.js';

export interface GeneratedSearchQuery {
  role: string;
  query: string;
  sourceTarget: 'remoteok' | 'jobicy' | 'himalayas' | 'ats' | 'generic';
  isContract: boolean;
  priority: number;
}

export class QueryGenerator {
  static generateQueries(profile: UserProfile, prefs: JobPreferences): GeneratedSearchQuery[] {
    const queries: GeneratedSearchQuery[] = [];

    const primarySkills = ['Kubernetes', 'Terraform', 'AWS', 'Azure', 'CI/CD', 'GitOps'];
    const securitySkills = ['DevSecOps', 'SonarQube', 'Snyk', 'Cloud Security'];
    const sreSkills = ['Prometheus', 'Grafana', 'Observability', 'Reliability'];

    for (const roleObj of prefs.targetRoles) {
      const role = roleObj.title;
      const weight = roleObj.weight;

      // 1. Broad remote search
      queries.push({
        role,
        query: `${role} Remote`,
        sourceTarget: 'generic',
        isContract: false,
        priority: Math.round(weight * 100),
      });

      // 2. India eligible / India remote search
      queries.push({
        role,
        query: `${role} India Remote`,
        sourceTarget: 'generic',
        isContract: false,
        priority: Math.round(weight * 90),
      });

      // 3. Tech-specific permutations
      if (role.includes('DevOps') || role.includes('Platform')) {
        queries.push({
          role,
          query: `${role} Kubernetes Terraform Remote`,
          sourceTarget: 'remoteok',
          isContract: false,
          priority: Math.round(weight * 95),
        });
        queries.push({
          role,
          query: `${role} AWS Azure CI/CD`,
          sourceTarget: 'jobicy',
          isContract: false,
          priority: Math.round(weight * 85),
        });
      }

      if (role.includes('DevSecOps')) {
        queries.push({
          role,
          query: `DevSecOps Cloud Security Terraform Remote`,
          sourceTarget: 'generic',
          isContract: false,
          priority: Math.round(weight * 90),
        });
      }

      if (role.includes('SRE') || role.includes('Reliability')) {
        queries.push({
          role,
          query: `Site Reliability Engineer Prometheus Kubernetes Remote`,
          sourceTarget: 'generic',
          isContract: false,
          priority: Math.round(weight * 90),
        });
      }

      // 4. Contract / Freelance queries
      queries.push({
        role,
        query: `Contract ${role} Terraform Kubernetes`,
        sourceTarget: 'generic',
        isContract: true,
        priority: Math.round(weight * 70),
      });
    }

    return queries.sort((a, b) => b.priority - a.priority);
  }
}
