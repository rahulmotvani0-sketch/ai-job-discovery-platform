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
    evaluation?: MatchScoreEvaluation
  ): ApplicationDraft {
    const id = randomUUID();
    const company = vacancy.companyName;
    const role = vacancy.title;

    // 1. Contextual subject line
    const subjectLine = `Application: ${role} - ${profile.fullName} (DevOps / Infrastructure Engineer)`;

    // 2. Highlighting top matching skills
    const topSkills = evaluation?.matchingSkills.slice(0, 4).join(', ') || 'Kubernetes, Terraform, AWS, CI/CD';

    // 3. Personalized application email body
    const emailBody = `Dear Hiring Team at ${company},

I am writing to express my strong enthusiasm for the ${role} opening at ${company}. With 4+ years of production experience across cloud infrastructure, multi-cloud Terraform provisioning, and container orchestration on Kubernetes, my background directly aligns with your operational and scalability objectives.

Key highlights of my background include:
• Multi-Cloud Infrastructure as Code: Architecting modular Terraform for AWS, Azure, and GCP, eliminating configuration drift and standardizing environment provisioning.
• Container Orchestration & GitOps: Operating Kubernetes clusters with Helm and ArgoCD, enforcing pod anti-affinity, resource boundaries, and automated zero-downtime rolling updates.
• Shift-Left Security: Embedding SonarQube SAST and Snyk SCA vulnerability gates directly into Jenkins, GitLab CI, and GitHub Actions pipelines to block insecure deployments.
• Observability & Reliability: Building comprehensive Prometheus, Grafana, and centralized logging stacks to minimize MTTR and enable actionable telemetry.

You can inspect my technical portfolio and production code samples at:
• Portfolio: ${profile.portfolioUrl}
• GitHub: ${profile.githubUrl}
• LinkedIn: ${profile.linkedinUrl}

I have attached my tailored resume for your review. I am available for remote opportunities and would welcome the chance to discuss how my hands-on infrastructure experience can benefit ${company}.

Sincerely,
${profile.fullName}
${profile.phone}
${profile.email}`;

    // 4. Concise Cover Letter
    const coverLetter = `To the Hiring Team at ${company},

As a DevOps and Cloud Infrastructure Engineer with 4+ years of experience architecting resilient infrastructure with Terraform and Kubernetes, I am excited about the opportunity to contribute to ${company} as a ${role}.

Throughout my career at Agile logic Technovations and Azilen Technologies, I have focused on closing the gap between software development and stable infrastructure. Whether building multi-cloud architectures across AWS/Azure, optimizing GitOps pipelines with ArgoCD, or hardening containerized deployments against CVEs using SonarQube and Snyk, I prioritize security, reliability, and automation.

I appreciate your consideration and look forward to the possibility of collaborating with your team.

Best regards,
${profile.fullName}
Ahmedabad, India (Open to Remote)`;

    // 5. Standard verified screening answers
    const screeningAnswers: Record<string, string> = {
      'Are you authorized to work remotely?': 'Yes, residing in India and eligible for international remote contracts and employment.',
      'How many years of experience do you have with Kubernetes & Terraform?': '4+ years of production experience architecting multi-cloud IaC and orchestrating Kubernetes workloads.',
      'What is your notice period?': 'Available within 15 to 30 days.',
      'What are your compensation expectations?': vacancy.salaryMin 
        ? `In alignment with published range: ${vacancy.currency || 'USD'} ${vacancy.salaryMin.toLocaleString()}`
        : 'Open to competitive market compensation (minimum equivalent of ₹15 LPA).',
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
      screeningAnswers,
      status: 'PENDING_REVIEW', // Starts strictly in pending review state
      createdAt: new Date().toISOString(),
    };
  }
}
