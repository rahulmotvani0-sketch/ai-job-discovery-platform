import { randomUUID } from 'node:crypto';
import type { Vacancy, UserProfile, ApplicationDraft, MatchScoreEvaluation } from '../types/index.js';

export class ApplicationWritingAgent {
  /**
   * Generates a tailored application email, cover letter, and screening answers.
   */
  static draftApplication(
    vacancy: Vacancy,
    profile: UserProfile,
    tailoredResumePath: string,
    evaluation?: MatchScoreEvaluation,
    tailoredPdfPath?: string
  ): ApplicationDraft {
    const id = randomUUID();
    const company = vacancy.companyName;
    const role = vacancy.title;

    // 1. Contextual subject line
    const targetTitle = profile.title || role;
    const subjectLine = `Application: ${role} - ${profile.fullName} (${targetTitle})`;

    // 2. Highlighting top matching skills
    const topSkills = evaluation?.matchingSkills.slice(0, 4).join(', ') || 'Modern Tech Stack & Architecture';

    // 3. Personalized application email body
    const emailBody = `Dear Hiring Team at ${company},

I am writing to express my strong enthusiasm for the ${role} opening at ${company}. With proven hands-on experience in software engineering, technical architecture, and system scalability, my background directly aligns with your requirements for this role.

Key technical competencies relevant to this opportunity:
• Core Expertise: ${topSkills}
• Engineering Best Practices: Scalable architecture, clean code, automated CI/CD testing, and security-first development.
• Reliability & Telemetry: Observability, comprehensive instrumentation, and rapid root-cause resolution.

Portfolio & Production Samples:
• Portfolio: ${profile.portfolioUrl}
• GitHub: ${profile.githubUrl}
• LinkedIn: ${profile.linkedinUrl}

I have attached my tailored ATS-optimized resume for your review. I am available for remote opportunities and would welcome the chance to discuss how my technical experience can benefit ${company}.

Sincerely,
${profile.fullName}
${profile.phone}
${profile.email}`;

    // 4. Concise Cover Letter
    const coverLetter = `To the Hiring Team at ${company},

I am excited to submit my application for the ${role} position at ${company}. With a strong track record of engineering scalable, resilient systems and delivering high-impact solutions, I am confident in my ability to contribute effectively from day one.

Throughout my career, I have focused on building performant software architectures, optimizing delivery workflows, and adhering to strict quality and security standards. I prioritize automation, collaboration, and continuous improvement.

I appreciate your consideration and look forward to the possibility of collaborating with your team.

Best regards,
${profile.fullName}
${profile.location} (Open to Remote)`;

    // 5. Standard verified screening answers
    const screeningAnswers: Record<string, string> = {
      'Are you authorized to work remotely?': `Yes, residing in ${profile.location || 'India'} and eligible for international remote contracts and employment.`,
      'What are your primary technical skills?': topSkills,
      'What is your notice period?': 'Available within 15 to 30 days.',
      'What are your compensation expectations?': vacancy.salaryMin 
        ? `In alignment with published range: ${vacancy.currency || 'USD'} ${vacancy.salaryMin.toLocaleString()}`
        : 'Open to competitive market compensation in line with experience.',
      'Portfolio / Work Samples': `${profile.portfolioUrl} | ${profile.githubUrl}`,
    };

    return {
      id,
      vacancyId: vacancy.id,
      recipientEmail: `careers@${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
      subjectLine,
      emailBody,
      coverLetter,
      tailoredResumePath,
      tailoredPdfPath,
      screeningAnswers,
      status: 'PENDING_REVIEW', // Starts strictly in pending review state
      createdAt: new Date().toISOString(),
    };
  }
}
