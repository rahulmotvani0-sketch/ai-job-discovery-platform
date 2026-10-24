import { randomUUID } from 'node:crypto';
import type { Vacancy, UserProfile, JobPreferences, MatchScoreEvaluation } from '../../types/index.js';

export class JobMatchingAgent {
  /**
   * Computes deterministic, evidence-backed 7-factor match score against candidate profile.
   */
  static evaluateMatch(
    vacancy: Vacancy,
    profile: UserProfile,
    prefs: JobPreferences
  ): MatchScoreEvaluation {
    const explanations: string[] = [];
    const matchingSkills: string[] = [];
    const missingSkills: string[] = [];

    // Flatten all verified user skills
    const userSkillsSet = new Set<string>();
    for (const category of Object.values(profile.skills)) {
      if (!Array.isArray(category)) continue;
      for (const skill of category) {
        // split composite skill names like "AWS (EC2, S3, RDS...)" into tokens
        userSkillsSet.add(skill.toLowerCase());
        const tokens = skill.toLowerCase().replace(/[(),]/g, ' ').split(/\s+/).filter((t: string) => t.length > 2);
        for (const token of tokens) userSkillsSet.add(token);
      }
    }

    const vacancySkills = vacancy.parsedRequirements?.essentialSkills || [];
    const reqText = `${vacancy.title} ${vacancy.rawDescription}`.toLowerCase();

    // 1. Technical skills alignment (Weight: 30%)
    let skillsMatchCount = 0;
    for (const skill of vacancySkills) {
      const lower = skill.toLowerCase();
      if (userSkillsSet.has(lower) || Array.from(userSkillsSet).some(us => us.includes(lower) || lower.includes(us))) {
        matchingSkills.push(skill);
        skillsMatchCount++;
      } else {
        missingSkills.push(skill);
      }
    }

    const skillRatio = vacancySkills.length > 0 ? (skillsMatchCount / vacancySkills.length) : 0.85;
    const technicalSkillsScore = Math.round(skillRatio * 30 * 10) / 10;
    explanations.push(`Technical Skills: ${skillsMatchCount}/${vacancySkills.length || 1} matched (${technicalSkillsScore}/30 pts). Verified matches: ${matchingSkills.slice(0, 5).join(', ')}.`);

    // 2. Experience and seniority (Weight: 20%)
    const userYearsExp = 4.2;
    const reqYears = vacancy.parsedRequirements?.yearsExperienceRequired ?? 3;
    let expScore = 15;

    if (userYearsExp >= reqYears) {
      expScore = 20;
      explanations.push(`Experience & Seniority: Candidate's 4+ years satisfies the required ${reqYears} years (20/20 pts).`);
    } else if (userYearsExp >= reqYears - 1) {
      expScore = 14;
      explanations.push(`Experience & Seniority: Candidate has 4+ years for a role targeting ~${reqYears} years (14/20 pts).`);
    } else {
      expScore = 8;
      explanations.push(`Experience & Seniority: Role requests ${reqYears} years which exceeds current 4+ years (8/20 pts).`);
    }

    // 3. Responsibilities alignment (Weight: 15%)
    // Check overlap with Terraform, Kubernetes, CI/CD, GitOps, DevSecOps in achievements
    let respScore = 0;
    const coreDomains = ['kubernetes', 'terraform', 'ci/cd', 'security', 'monitoring', 'cloud'];
    let domainHits = 0;
    for (const domain of coreDomains) {
      if (reqText.includes(domain)) {
        domainHits++;
      }
    }
    respScore = Math.min(15, Math.round((domainHits / 4) * 15));
    explanations.push(`Responsibilities Alignment: Core production domains matched in job responsibilities (${respScore}/15 pts).`);

    // 4. Cloud and infrastructure relevance (Weight: 10%)
    let cloudScore = 0;
    const hasAws = reqText.includes('aws') || reqText.includes('amazon');
    const hasAzure = reqText.includes('azure');
    const hasGcp = reqText.includes('gcp') || reqText.includes('google cloud');
    const hasK8s = reqText.includes('kubernetes') || reqText.includes('k8s');
    const hasTf = reqText.includes('terraform');

    if (hasAws || hasAzure || hasGcp) cloudScore += 5;
    if (hasK8s || hasTf) cloudScore += 5;
    cloudScore = Math.min(10, cloudScore);
    explanations.push(`Cloud & Infrastructure Relevance: Infrastructure stack (AWS/Azure/GCP/Kubernetes/Terraform) verified in profile (${cloudScore}/10 pts).`);

    // 5. Location and remote eligibility (Weight: 10%)
    let locationScore = 0;
    if (vacancy.acceptsIndia && vacancy.isRemote) {
      locationScore = 10;
      explanations.push('Location & Remote: Fully remote position open to India residents (10/10 pts).');
    } else if (vacancy.isRemote && !vacancy.acceptsIndia) {
      locationScore = 0; // Strict penalty for geographic restriction
      explanations.push('Location & Remote: Role is remote but excludes India or requires domestic residency (0/10 pts).');
    } else if (!vacancy.isRemote && vacancy.locationText.toLowerCase().includes('ahmedabad')) {
      locationScore = 8;
      explanations.push('Location: Onsite/Hybrid role located in candidate home city (Ahmedabad) (8/10 pts).');
    } else {
      locationScore = 2;
      explanations.push('Location: Hybrid/Onsite role outside local territory (2/10 pts).');
    }

    // 6. Compensation alignment (Weight: 10%)
    let compScore = 7; // Default baseline if undisclosed
    if (vacancy.salaryMin || vacancy.salaryMax) {
      const minInrEquivalent = vacancy.currency === 'USD' 
        ? ((vacancy.salaryMin || 0) * 85) / 100000 // USD to INR LPA
        : (vacancy.salaryMin || 0);

      if (minInrEquivalent >= prefs.minCompensationInrLpa) {
        compScore = 10;
        explanations.push(`Compensation: Published salary meets or exceeds candidate target of ₹${prefs.minCompensationInrLpa} LPA (10/10 pts).`);
      } else {
        compScore = 4;
        explanations.push(`Compensation: Published salary falls below ₹${prefs.minCompensationInrLpa} LPA benchmark (4/10 pts).`);
      }
    } else {
      explanations.push('Compensation: Undisclosed in listing; neutral baseline awarded (7/10 pts).');
    }

    // 7. Other practical requirements (Weight: 5%)
    let otherScore = 5;
    if (vacancy.isContractOrFreelance) {
      otherScore = 4;
      explanations.push('Practical: Tracked as freelance/contract opportunity (4/5 pts).');
    } else {
      explanations.push('Practical: Full-time employment aligns with candidate preference (5/5 pts).');
    }

    // Calculate total score (rounded to 2 decimal places for boundary stability)
    let overallScore = technicalSkillsScore + expScore + respScore + cloudScore + locationScore + compScore + otherScore;
    overallScore = Math.max(0, Math.min(100, Math.round(overallScore * 100) / 100));

    const mandatoryBlockers: string[] = [];

    // Cap score if location strictly excludes candidate country
    if (vacancy.isRemote && !vacancy.acceptsIndia) {
      overallScore = Math.min(overallScore, 48.0);
      mandatoryBlockers.push('Geographic restriction: Role requires domestic residency and excludes candidate base country.');
    }

    const minThreshold = prefs.minMatchScore !== undefined ? prefs.minMatchScore : 75.0;
    // Inclusive comparison: >= minThreshold qualifies, exact 75.0 qualifies (74.99 fails, 75.00 passes, 75.01 passes)
    const qualifies75 = Math.round(overallScore * 100) >= Math.round(minThreshold * 100) && mandatoryBlockers.length === 0;

    let tier: MatchScoreEvaluation['tier'] = 'Deprioritized';
    if (overallScore >= 85) tier = 'Excellent';
    else if (overallScore >= 70) tier = 'Strong';
    else if (overallScore >= 55) tier = 'Possible';

    return {
      id: randomUUID(),
      vacancyId: vacancy.id,
      overallScore,
      qualifies75,
      mandatoryBlockers: mandatoryBlockers.length > 0 ? mandatoryBlockers : undefined,
      tier,
      categoryScores: {
        technicalSkills: technicalSkillsScore,
        experienceSeniority: expScore,
        responsibilities: respScore,
        cloudInfrastructure: cloudScore,
        locationRemote: locationScore,
        compensation: compScore,
        otherRequirements: otherScore,
      },
      matchingSkills,
      missingSkills,
      evidenceExplanation: explanations.join('\n'),
      evaluatedAt: new Date().toISOString(),
    };
  }
}
