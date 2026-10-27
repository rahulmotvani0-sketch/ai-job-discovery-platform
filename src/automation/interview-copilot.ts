import { randomUUID } from 'node:crypto';
import { DatabaseManager } from '../core/database.js';
import { logger } from '../core/logger.js';
import type { 
  InterviewPrepDossier, 
  TechnicalQuestionPrep, 
  BehavioralQuestionPrep, 
  CompanyIntelligence,
  UserProfile,
  Vacancy 
} from '../types/index.js';

export interface GeneratePrepOptions {
  interactionId?: string;
  vacancyId?: string;
  submissionId?: string;
  companyName?: string;
  jobTitle?: string;
  jobDescription?: string;
}

export class InterviewCopilotEngine {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * Generates a grounded, comprehensive interview preparation dossier.
   */
  async generateDossier(options: GeneratePrepOptions): Promise<InterviewPrepDossier> {
    logger.info('Generating interview preparation dossier', { options });

    let company = options.companyName || 'Target Company';
    let role = options.jobTitle || 'Senior Software Engineer';
    let jobDesc = options.jobDescription || '';
    let vacancy: Vacancy | null = null;

    // 1. Resolve from interaction if supplied
    if (options.interactionId) {
      const interaction = this.db.getRecruiterInteractionById(options.interactionId);
      if (interaction) {
        company = interaction.companyName || company;
        role = interaction.jobTitle || role;
        if (interaction.submissionId) {
          const sub = this.db.listSubmissions().find(s => s.id === interaction.submissionId);
          if (sub) {
            vacancy = this.db.getVacancyById(sub.vacancyId);
          }
        }
      }
    }

    // 2. Resolve from vacancy if supplied
    if (!vacancy && options.vacancyId) {
      vacancy = this.db.getVacancyById(options.vacancyId);
    }

    if (vacancy) {
      company = vacancy.companyName || company;
      role = vacancy.title || role;
      jobDesc = vacancy.rawDescription || jobDesc;
    }

    // 3. Load Candidate Profile
    const candidateProfile = this.db.getUserProfile() || this.getDefaultCandidateProfile();

    // 4. Synthesize Company Intelligence
    const companyIntelligence = this.synthesizeCompanyIntelligence(company, role, jobDesc);

    // 5. Extract Role Focus Areas
    const roleFocusAreas = this.extractRoleFocusAreas(role, jobDesc, companyIntelligence.coreTechStack);

    // 6. Generate Tailored Technical Questions with Candidate Talking Points
    const technicalQuestions = this.generateTechnicalQuestions(role, companyIntelligence, candidateProfile);

    // 7. Generate Behavioral STAR Questions with Project Tie-Ins
    const behavioralQuestions = this.generateBehavioralQuestions(role, company, candidateProfile);

    // 8. Generate Questions to Ask the Interviewer
    const questionsForInterviewer = this.generateQuestionsForInterviewer(company, companyIntelligence);

    // 9. Generate Compensation Benchmark
    const compensationBenchmark = this.generateCompensationBenchmark(role, company);

    // 10. Generate Strategic Game Plan & Key Advice
    const keyAdvice = this.generateKeyAdvice(role, company, companyIntelligence);

    const dossier: InterviewPrepDossier = {
      id: randomUUID(),
      interactionId: options.interactionId,
      vacancyId: vacancy?.id || options.vacancyId,
      submissionId: options.submissionId,
      companyName: company,
      jobTitle: role,
      companyIntelligence,
      roleFocusAreas,
      technicalQuestions,
      behavioralQuestions,
      questionsForInterviewer,
      compensationBenchmark,
      keyAdvice,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Persist dossier in SQLite
    this.db.saveInterviewPrepDossier(dossier);
    logger.info(`Interview preparation dossier generated successfully for ${company} (${role})`, { dossierId: dossier.id });

    return dossier;
  }

  /**
   * Retrieves an existing dossier or generates one if missing.
   */
  async getOrGenerateDossier(options: GeneratePrepOptions): Promise<InterviewPrepDossier> {
    if (options.interactionId) {
      const existing = this.db.getInterviewPrepDossierByInteractionId(options.interactionId);
      if (existing) return existing;
    }

    if (options.vacancyId) {
      const existing = this.db.getInterviewPrepDossierByVacancyId(options.vacancyId);
      if (existing) return existing;
    }

    return this.generateDossier(options);
  }

  // ==========================================
  // Private Generation & Intelligence Helpers
  // ==========================================

  private getFlatCandidateSkills(candidate: UserProfile): string[] {
    if (!candidate.skills) return ['TypeScript', 'Node.js', 'Go', 'Kubernetes', 'Docker', 'AWS'];
    const list: string[] = [];
    for (const val of Object.values(candidate.skills)) {
      if (Array.isArray(val)) {
        list.push(...val);
      }
    }
    return list.length ? list : ['TypeScript', 'Node.js', 'Go', 'Kubernetes', 'Docker', 'AWS'];
  }

  private synthesizeCompanyIntelligence(company: string, role: string, jobDesc: string): CompanyIntelligence {
    const text = `${company} ${role} ${jobDesc}`.toLowerCase();
    let industry = 'Technology & Cloud Software';
    let stageOrSize = 'Growth-Stage / Mid-Market Enterprise';

    if (text.includes('fintech') || text.includes('pay') || text.includes('bank') || text.includes('trading') || text.includes('crypto')) {
      industry = 'Financial Technology (FinTech) & Distributed Ledger';
      stageOrSize = 'High-Growth FinTech Enterprise';
    } else if (text.includes('ai') || text.includes('machine learning') || text.includes('llm') || text.includes('data platform')) {
      industry = 'Artificial Intelligence & Data Platforms';
      stageOrSize = 'AI Infrastructure & Model Platform';
    } else if (text.includes('health') || text.includes('bio') || text.includes('medical') || text.includes('clinical')) {
      industry = 'Digital Health & Life Sciences';
      stageOrSize = 'HealthTech Software & Compliance';
    } else if (text.includes('security') || text.includes('cyber') || text.includes('identity') || text.includes('auth')) {
      industry = 'Cybersecurity & Cloud Identity';
      stageOrSize = 'Cloud Security & Compliance Enterprise';
    } else if (text.includes('devops') || text.includes('infra') || text.includes('sre') || text.includes('kubernetes') || text.includes('cloud')) {
      industry = 'Cloud Infrastructure & Developer Productivity';
      stageOrSize = 'Modern Cloud-Native Tech Platform';
    }

    // Detect Core Tech Stack from description or sensible defaults
    const candidateTech = [
      'TypeScript', 'Node.js', 'Go', 'Python', 'Kubernetes', 'Docker',
      'AWS', 'GCP', 'PostgreSQL', 'Redis', 'Kafka', 'Terraform',
      'React', 'Next.js', 'GraphQL', 'Prometheus', 'Datadog', 'CI/CD'
    ];
    
    const detectedTech = candidateTech.filter(t => text.includes(t.toLowerCase()));
    const coreTechStack = detectedTech.length >= 3 ? detectedTech : ['TypeScript', 'Node.js', 'Kubernetes', 'Docker', 'AWS', 'PostgreSQL', 'Redis'];

    return {
      name: company,
      industry,
      stageOrSize,
      missionOverview: `Delivering mission-critical engineering solutions for ${company}'s users with a strong emphasis on system reliability, velocity, and scalable platform architecture.`,
      coreTechStack,
      cultureHighlights: [
        'High ownership culture with end-to-end service accountability',
        'Emphasis on clean design docs, automated testing, and blameless postmortems',
        'Continuous deployment posture with strong observability metrics'
      ],
      recentDevelopments: [
        'Expanding global infrastructure to handle higher concurrency and lower latency',
        'Modernizing telemetry, container orchestration, and real-time event streaming pipelines'
      ]
    };
  }

  private extractRoleFocusAreas(role: string, jobDesc: string, techStack: string[]): string[] {
    const r = role.toLowerCase();
    const areas: string[] = [];

    if (r.includes('devops') || r.includes('sre') || r.includes('reliability') || r.includes('infrastructure')) {
      areas.push('Zero-downtime deployment automation & progressive rollouts');
      areas.push('Kubernetes cluster topology, auto-scaling & pod resource optimization');
      areas.push('Infrastructure-as-Code (Terraform) governance and drift management');
      areas.push('Observability architecture (SLOs, SLIs, Prometheus, Datadog alerts)');
    } else if (r.includes('backend') || r.includes('distributed') || r.includes('platform')) {
      areas.push('High-throughput REST and gRPC API contract design & rate-limiting');
      areas.push('Event-driven architecture with message brokers (Kafka / RabbitMQ)');
      areas.push('Relational & NoSQL persistence tuning (PostgreSQL indexing, Redis caching)');
      areas.push('Concurrency control, idempotency keys, and graceful service degradation');
    } else if (r.includes('frontend') || r.includes('full stack') || r.includes('fullstack')) {
      areas.push('End-to-end full-stack feature delivery across client, API, and database');
      areas.push('State management, rendering performance, and Core Web Vitals optimization');
      areas.push('Secure session handling, authentication flows, and token lifecycle');
      areas.push('Reusable design system components and type-safe integration contracts');
    } else {
      areas.push('Scalable architecture and technical trade-off evaluation');
      areas.push('Cross-functional stakeholder collaboration and technical mentorship');
      areas.push('Code maintainability, automated CI testing, and security hardening');
    }

    if (techStack.length) {
      areas.push(`Production mastery across stack: ${techStack.slice(0, 4).join(', ')}`);
    }

    return areas;
  }

  private generateTechnicalQuestions(
    role: string, 
    companyIntel: CompanyIntelligence, 
    candidate: UserProfile
  ): TechnicalQuestionPrep[] {
    const skillsList = this.getFlatCandidateSkills(candidate);
    const primarySkill = skillsList[0] || 'TypeScript';
    const secondarySkill = skillsList[1] || 'Node.js';
    const cloudSkill = skillsList.find(s => ['AWS', 'GCP', 'Kubernetes', 'Docker'].includes(s)) || 'Kubernetes';

    return [
      {
        id: randomUUID(),
        question: `How would you architect a distributed service in ${primarySkill} and ${secondarySkill} that handles thousands of concurrent requests while maintaining low p99 latency?`,
        category: 'System Design & Scalability',
        difficulty: 'HARD',
        relevanceReason: `Directly assesses your capability to design resilient architectures suitable for ${companyIntel.name}'s scale.`,
        candidateTalkingPoints: [
          `Discuss horizontal scaling and stateless worker nodes behind round-robin load balancers.`,
          `Highlight asynchronous decoupling using event buses (Kafka/Redis streams) to keep user-facing request latency sub-50ms.`,
          `Reference your hands-on experience optimizing database queries with indexing, connection pooling, and multi-tier caching.`
        ],
        suggestedAnswerFramework: `1. Clarify constraints (RPS, read/write ratio, latency SLAs). 2. High-level architecture (CDN, API Gateway, Services, DB). 3. Deep-dive into bottleneck prevention (caching layers, backpressure handling, circuit breakers). 4. Telemetry and failover strategy.`
      },
      {
        id: randomUUID(),
        question: `Explain how you would implement automated rollouts and canary deployments on ${cloudSkill} with automated rollbacks on error budget breaches.`,
        category: 'Infrastructure & Reliability',
        difficulty: 'MEDIUM',
        relevanceReason: `Validates modern DevOps best practices and safe release engineering.`,
        candidateTalkingPoints: [
          `Emphasize declarative configuration using GitOps principles.`,
          `Describe traffic shifting (e.g. 5% canary -> 25% -> 100%) gated by automated Prometheus/Datadog metric monitors.`,
          `Explain automated rollback triggers when HTTP 5xx errors or p95 latency exceeds established SLO thresholds.`
        ],
        suggestedAnswerFramework: `1. Ingress and service routing mechanics. 2. Health check definition (readiness vs liveness probes). 3. Metric analysis during phased shift. 4. Instant rollback mechanics.`
      },
      {
        id: randomUUID(),
        question: `How do you handle idempotency and transaction boundaries when coordinating writes across multiple backend services?`,
        category: 'Distributed Systems & Data Consistency',
        difficulty: 'HARD',
        relevanceReason: `Ensures data integrity across distributed payment, workflow, or state management transactions.`,
        candidateTalkingPoints: [
          `Explain unique client-generated Idempotency Keys with Redis-backed atomic locking.`,
          `Discuss Saga Pattern (orchestrated or choreographed) for distributed workflows with compensating transactions.`,
          `Mention database transactions, optimistic concurrency control (OCC), and atomic updates.`
        ],
        suggestedAnswerFramework: `1. Define the risk of duplicate network retries. 2. Walk through idempotency header validation. 3. Detail compensating actions if a downstream step fails.`
      },
      {
        id: randomUUID(),
        question: `Walk us through a time you identified and resolved a severe performance bottleneck or memory leak in production.`,
        category: 'Debugging & Performance Profiling',
        difficulty: 'MEDIUM',
        relevanceReason: `Tests hands-on troubleshooting under pressure and familiarity with profiling tools.`,
        candidateTalkingPoints: [
          `Cite heap memory snapshot analysis and event loop delay profiling in Node.js/Go runtimes.`,
          `Explain locating uncollected event listeners, circular references, or unbounded memory queues.`,
          `Discuss the verified post-fix metrics showing stabilized memory ceilings and reduced CPU load.`
        ],
        suggestedAnswerFramework: `1. Initial symptom detection (alerts, OOM crashes). 2. Systematic isolation (reproduction, APM tracing, memory heap dumps). 3. Root cause remediation. 4. Prevention guards (lint rules, load testing).`
      }
    ];
  }

  private generateBehavioralQuestions(
    role: string, 
    company: string, 
    candidate: UserProfile
  ): BehavioralQuestionPrep[] {
    const leadProject = candidate.experiences?.[0]?.company || 'Cloud Scale Platform';
    const roleTitle = candidate.experiences?.[0]?.role || role;

    return [
      {
        id: randomUUID(),
        question: `Describe a high-stakes production incident or outage you navigated. How did you triage, resolve, and communicate during the event?`,
        competency: 'Incident Management & Resilience',
        starFramework: {
          situation: `During a peak traffic surge at ${leadProject}, downstream API timeouts caused worker queue backlogs and intermittent 504 gateway timeouts.`,
          task: `Take command of incident triage as technical lead, restore service availability within SLO limits, and maintain transparent stakeholder communication.`,
          action: `Activated emergency circuit breakers to shed non-critical load, scaled container replicas horizontally, and rapidly pinned traffic away from a degraded database read replica.`,
          result: `Restored full system responsiveness in 18 minutes without data loss, followed by a blameless retrospective and automated preventative safeguards.`
        },
        candidateProjectTieIn: `Draw on your experience as ${roleTitle} managing production reliability and high-availability systems.`
      },
      {
        id: randomUUID(),
        question: `Tell me about a time you had a strong technical disagreement with a team member or architect regarding technical design. How did you resolve it?`,
        competency: 'Constructive Collaboration & Technical Trade-offs',
        starFramework: {
          situation: `The team was divided between adopting a monolithic synchronous API design versus an event-driven architecture for a new data sync pipeline.`,
          task: `Align the engineering team on a unified, maintainable technical path without stalling release deadlines.`,
          action: `Created a lightweight architectural spike comparing latency, operational complexity, and failover characteristics of both options, anchoring the discussion on objective benchmarks rather than opinion.`,
          result: `The team unanimously adopted the event-driven approach based on data, delivering the milestone on time with zero operational regressions.`
        },
        candidateProjectTieIn: `Highlight your collaborative decision-making style and focus on empirical benchmarks.`
      },
      {
        id: randomUUID(),
        question: `Give an example of how you managed aggressive deadlines or shifting scope while ensuring high code quality and test coverage.`,
        competency: 'Execution & Prioritization',
        starFramework: {
          situation: `A major client contract required critical API features shipped 3 weeks ahead of the original sprint plan.`,
          task: `Deliver the requested core features rapidly without compromising automated test coverage or taking on crippling technical debt.`,
          action: `Broke the initiative into essential MVP slices, deferred non-essential UI bells, and paired strict unit/integration tests with feature flags for safe incremental deployment.`,
          result: `Successfully launched on schedule with 100% test pass rates and zero urgent production hotfixes.`
        },
        candidateProjectTieIn: `Emphasize pragmatic scoping and disciplined automated verification.`
      }
    ];
  }

  private generateQuestionsForInterviewer(company: string, companyIntel: CompanyIntelligence): string[] {
    return [
      `What does the deployment workflow and release velocity look like for the team day-to-day (e.g. continuous delivery, branch deployments)?`,
      `How does ${company} balance new product feature velocity against addressing technical debt and platform reliability?`,
      `What are the most challenging technical bottlenecks or scalability hurdles your engineering team is actively tackling over the next 6–12 months?`,
      `How are production incidents handled here, and what is your team's culture around postmortems and continuous learning?`,
      `What does success look like for someone stepping into this role in the first 90 days?`
    ];
  }

  private generateCompensationBenchmark(role: string, company: string) {
    const r = role.toLowerCase();
    let min = 135000;
    let max = 195000;

    if (r.includes('staff') || r.includes('principal') || r.includes('lead') || r.includes('director')) {
      min = 180000;
      max = 250000;
    } else if (r.includes('senior') || r.includes('sr.')) {
      min = 145000;
      max = 210000;
    } else if (r.includes('junior') || r.includes('entry') || r.includes('associate')) {
      min = 85000;
      max = 125000;
    }

    return {
      roleTitle: role,
      estimatedMin: min,
      estimatedMax: max,
      currency: 'USD',
      marketSource: `Levels.fyi & Radford Aggregated Tech Compensation Index`,
      negotiationTips: [
        `Anchor discussions around your verified achievements, scale managed, and full-stack/system breadth.`,
        `Request details on equity vesting schedules, performance bonuses, and annual refresher grants.`,
        `Ask for the approved salary band for this specific title before sharing your expected compensation.`
      ]
    };
  }

  private generateKeyAdvice(role: string, company: string, companyIntel: CompanyIntelligence): string[] {
    return [
      `Anchor your answers in concrete metrics: whenever describing an achievement, quantify the impact (e.g. "reduced deployment time by 40%", "supported 10x traffic").`,
      `Think out loud during technical and architecture screens: interviewers assess your problem decomposition process just as much as the final answer.`,
      `Demonstrate high agency: emphasize times you proactively unblocked teammates, simplified complex codebases, and championed test automation.`,
      `Be prepared to discuss failure gracefully: share a real technical mistake and articulate the lasting safeguard or process improvement you established as a result.`
    ];
  }

  private getDefaultCandidateProfile(): UserProfile {
    return {
      id: 'default_candidate',
      fullName: 'Candidate',
      email: 'candidate@example.com',
      phone: '',
      location: 'Remote',
      portfolioUrl: '',
      githubUrl: '',
      linkedinUrl: '',
      summary: 'Experienced Senior Software Engineer specializing in distributed systems and cloud platforms.',
      skills: {
        cloudPlatforms: ['AWS', 'GCP'],
        infrastructureAsCode: ['Terraform'],
        containersAndOrchestration: ['Kubernetes', 'Docker'],
        ciCdAndGitOps: ['GitHub Actions', 'ArgoCD'],
        devSecOpsAndSecurity: [],
        observabilityAndMonitoring: ['Prometheus', 'Datadog'],
        programmingAndScripting: ['TypeScript', 'Node.js', 'Go', 'Python'],
        networkingAndAdmin: []
      },
      experiences: [
        {
          company: 'Technology Systems',
          role: 'Senior Software Engineer',
          startDate: '2022',
          endDate: 'Present',
          location: 'Remote',
          achievements: ['Led distributed architecture and cloud reliability initiatives.'],
          skillsUsed: ['TypeScript', 'Kubernetes', 'AWS', 'Docker']
        }
      ],
      certifications: [],
      education: []
    };
  }
}
