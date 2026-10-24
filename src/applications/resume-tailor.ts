import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../core/logger.js';
import type { Vacancy, UserProfile } from '../types/index.js';

export interface TailoredResumeResult {
  id: string;
  vacancyId: string;
  markdownContent: string;
  filePath: string;
  highlightedSkills: string[];
  targetedAchievements: string[];
  createdAt: string;
}

export class ResumeTailoringAgent {
  private outputDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.outputDir = join(baseDir, 'data', 'resumes', 'tailored');
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Generates a vacancy-specific tailored resume strictly using verified evidence from the profile.
   * Hallucination Guard: Never invents dates, titles, metrics, or technologies not present in the master profile.
   */
  tailorResume(vacancy: Vacancy, profile: UserProfile): TailoredResumeResult {
    const id = randomUUID();
    const reqText = `${vacancy.title} ${vacancy.rawDescription} ${vacancy.parsedRequirements?.essentialSkills.join(' ')}`.toLowerCase();

    // 1. Identify relevant skills to highlight first
    const highlightedSkills: string[] = [];
    const allUserSkills = [
      ...profile.skills.cloudPlatforms,
      ...profile.skills.infrastructureAsCode,
      ...profile.skills.containersAndOrchestration,
      ...profile.skills.ciCdAndGitOps,
      ...profile.skills.devSecOpsAndSecurity,
      ...profile.skills.observabilityAndMonitoring,
      ...profile.skills.programmingAndScripting,
      ...profile.skills.networkingAndAdmin,
    ];

    for (const skill of allUserSkills) {
      const tokens = skill.toLowerCase().replace(/[(),]/g, ' ').split(/\s+/).filter(t => t.length > 2);
      if (tokens.some(t => reqText.includes(t))) {
        highlightedSkills.push(skill);
      }
    }

    // 2. Prioritize relevant work experience achievements
    const targetedAchievements: string[] = [];
    const tailoredExperiences = profile.experiences.map(exp => {
      // Sort achievements so those matching the job requirements appear first
      const sortedAchievements = [...exp.achievements].sort((a, b) => {
        const aTokens = a.toLowerCase().split(/\s+/);
        const bTokens = b.toLowerCase().split(/\s+/);
        const aMatches = aTokens.filter(t => reqText.includes(t)).length;
        const bMatches = bTokens.filter(t => reqText.includes(t)).length;
        return bMatches - aMatches;
      });

      targetedAchievements.push(...sortedAchievements.slice(0, 2));

      return {
        ...exp,
        achievements: sortedAchievements,
      };
    });

    // 3. Assemble clean ATS-friendly tailored Markdown resume
    const mdLines: string[] = [
      `# ${profile.fullName.toUpperCase()}`,
      `**${vacancy.title} | Cloud Infrastructure & DevOps Automation**`,
      `${profile.location} · ${profile.email} · ${profile.phone}`,
      `[Portfolio](${profile.portfolioUrl}) · [GitHub](${profile.githubUrl}) · [LinkedIn](${profile.linkedinUrl})`,
      '',
      '---',
      '',
      '## PROFESSIONAL SUMMARY',
      profile.summary,
      '',
      '---',
      '',
      '## TARGETED TECHNICAL COMPETENCIES',
      `**Cloud Platforms:** ${profile.skills.cloudPlatforms.join(', ')}`,
      `**Infrastructure as Code:** ${profile.skills.infrastructureAsCode.join(', ')}`,
      `**Containers & Orchestration:** ${profile.skills.containersAndOrchestration.join(', ')}`,
      `**CI/CD & GitOps:** ${profile.skills.ciCdAndGitOps.join(', ')}`,
      `**DevSecOps & Cloud Security:** ${profile.skills.devSecOpsAndSecurity.join(', ')}`,
      `**Observability & Monitoring:** ${profile.skills.observabilityAndMonitoring.join(', ')}`,
      `**Scripting & Automation:** ${profile.skills.programmingAndScripting.join(', ')}`,
      `**Systems & Networking:** ${profile.skills.networkingAndAdmin.join(', ')}`,
      '',
      '---',
      '',
      '## PROFESSIONAL EXPERIENCE',
    ];

    for (const exp of tailoredExperiences) {
      mdLines.push(`### ${exp.role} — ${exp.company}`);
      mdLines.push(`**${exp.startDate} – ${exp.endDate}** | ${exp.location}`);
      mdLines.push('');
      for (const bullet of exp.achievements) {
        mdLines.push(`- ${bullet}`);
      }
      mdLines.push('');
    }

    mdLines.push('---');
    mdLines.push('## EDUCATION & CERTIFICATIONS');
    for (const edu of profile.education) {
      mdLines.push(`- **${edu.degree}**, ${edu.institution} (${edu.year || ''})`);
    }
    for (const cert of profile.certifications) {
      mdLines.push(`- ${cert}`);
    }

    const markdownContent = mdLines.join('\n');
    const safeFileName = `resume_${vacancy.companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${vacancy.id.slice(0, 8)}.md`;
    const filePath = join(this.outputDir, safeFileName);

    try {
      writeFileSync(filePath, markdownContent, { mode: 0o600 });
      logger.info(`Tailored resume generated at ${filePath} (${markdownContent.length} chars).`);
    } catch (err) {
      logger.warn(`Could not write tailored resume to disk: ${err}`);
    }

    return {
      id,
      vacancyId: vacancy.id,
      markdownContent,
      filePath,
      highlightedSkills: Array.from(new Set(highlightedSkills)),
      targetedAchievements,
      createdAt: new Date().toISOString(),
    };
  }
}
