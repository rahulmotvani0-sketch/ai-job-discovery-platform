import PDFDocument from 'pdfkit';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logger } from '../core/logger.js';
import type { UserProfile, Vacancy } from '../types/index.js';

export interface PdfGenerationOptions {
  outputPath?: string;
  title?: string;
}

export class AtsPdfGenerator {
  /**
   * Compiles tailored Markdown resume into a clean, ATS-compliant PDF document.
   * Uses standard core fonts (Helvetica) and standard single-column layout for ATS parser compatibility.
   */
  static async compileMarkdownToPdf(markdown: string, outputPath: string): Promise<string> {
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 36, bottom: 36, left: 40, right: 40 },
          info: {
            Title: 'Resume',
            Author: 'Candidate',
            Subject: 'Job Application Resume',
            Keywords: 'Resume, ATS, Tech, Software, DevOps, Engineering',
          },
        });

        const writeStream = createWriteStream(outputPath);
        doc.pipe(writeStream);

        const lines = markdown.split('\n');
        let inExperienceSection = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          if (!line) {
            doc.moveDown(0.25);
            continue;
          }

          // Horizontal rule
          if (line === '---' || line === '***') {
            doc.moveDown(0.2);
            doc.strokeColor('#cbd5e1').lineWidth(0.75).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
            doc.moveDown(0.3);
            continue;
          }

          // Main Header: # NAME
          if (line.startsWith('# ')) {
            const name = line.replace('# ', '').trim();
            doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text(name, { align: 'center' });
            doc.moveDown(0.2);
            continue;
          }

          // Subtitle / Title: **Title**
          if (line.startsWith('**') && line.endsWith('**') && !line.includes(':')) {
            const title = line.replace(/^\*\*|\*\*$/g, '').trim();
            doc.font('Helvetica-Bold').fontSize(11).fillColor('#334155').text(title, { align: 'center' });
            doc.moveDown(0.2);
            continue;
          }

          // Section Header: ## SECTION
          if (line.startsWith('## ')) {
            const heading = line.replace('## ', '').trim();
            doc.moveDown(0.3);
            doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(heading.toUpperCase(), { underline: false });
            doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(doc.page.margins.left, doc.y + 1).lineTo(doc.page.width - doc.page.margins.right, doc.y + 1).stroke();
            doc.moveDown(0.3);
            inExperienceSection = heading.includes('EXPERIENCE');
            continue;
          }

          // Sub-heading: ### Role — Company
          if (line.startsWith('### ')) {
            const role = line.replace('### ', '').trim();
            doc.moveDown(0.25);
            doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#1e293b').text(role);
            continue;
          }

          // Bullet points: - Bullet text
          if (line.startsWith('- ') || line.startsWith('* ')) {
            const bulletText = line.replace(/^[-*]\s+/, '').trim();
            // Parse bold fragments within bullet
            doc.font('Helvetica').fontSize(9.5).fillColor('#334155');
            doc.text('•  ', { continued: true, indent: 8 });
            
            // Clean markdown bold syntax for ATS readability
            const cleanText = bulletText.replace(/\*\*(.*?)\*\*/g, '$1');
            doc.text(cleanText, { indent: 18 });
            doc.moveDown(0.15);
            continue;
          }

          // Key-Value technical competencies: **Category:** Skills
          if (line.startsWith('**') && line.includes(':**')) {
            const parts = line.split(':**');
            const category = parts[0].replace(/^\*\*/, '').trim();
            const skills = parts[1] ? parts[1].trim() : '';

            doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1e293b').text(`${category}: `, { continued: true });
            doc.font('Helvetica').fillColor('#334155').text(skills);
            doc.moveDown(0.15);
            continue;
          }

          // Dates / location line: **dates** | location
          if (line.includes(' | ') && (line.includes('20') || line.includes('19') || line.includes('Present'))) {
            const cleanLine = line.replace(/\*\*/g, '');
            doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748b').text(cleanLine);
            doc.moveDown(0.2);
            continue;
          }

          // Contact info row (contains email, links, or phone)
          if (line.includes('@') || line.includes('·') || line.includes('[LinkedIn]')) {
            const cleanContact = line.replace(/\[(.*?)\]\((.*?)\)/g, '$1 ($2)').replace(/·/g, '|');
            doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(cleanContact, { align: 'center' });
            doc.moveDown(0.25);
            continue;
          }

          // General paragraph text (e.g. Summary)
          const cleanParagraph = line.replace(/\*\*(.*?)\*\*/g, '$1');
          doc.font('Helvetica').fontSize(9.5).fillColor('#334155').text(cleanParagraph, {
            lineGap: 1.5,
            align: 'justify',
          });
          doc.moveDown(0.2);
        }

        doc.end();

        writeStream.on('finish', () => {
          logger.info(`ATS PDF resume generated successfully at ${outputPath}`);
          resolve(outputPath);
        });

        writeStream.on('error', (err) => {
          logger.warn(`Failed writing ATS PDF: ${err}`);
          reject(err);
        });
      } catch (err) {
        logger.warn(`Error generating ATS PDF: ${err}`);
        reject(err);
      }
    });
  }

  /**
   * Generates a tailored ATS PDF directly from structured profile and vacancy data.
   */
  static async generateFromProfile(
    profile: UserProfile,
    vacancy?: Vacancy,
    options?: PdfGenerationOptions
  ): Promise<string> {
    const baseDir = process.cwd();
    const safeName = vacancy
      ? `resume_${vacancy.companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${vacancy.id.slice(0, 8)}.pdf`
      : `resume_${profile.fullName.replace(/[^a-zA-Z0-9]/g, '_')}_master.pdf`;

    const outputPath = options?.outputPath || join(baseDir, 'data', 'resumes', 'tailored', safeName);
    const targetTitle = options?.title || (vacancy ? vacancy.title : profile.title || 'Software Engineer');

    // Assemble markdown to compile
    const mdLines: string[] = [
      `# ${profile.fullName.toUpperCase()}`,
      `**${targetTitle}**`,
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
    ];

    if (profile.skills.cloudPlatforms?.length) {
      mdLines.push(`**Cloud Platforms:** ${profile.skills.cloudPlatforms.join(', ')}`);
    }
    if (profile.skills.infrastructureAsCode?.length) {
      mdLines.push(`**Infrastructure as Code:** ${profile.skills.infrastructureAsCode.join(', ')}`);
    }
    if (profile.skills.containersAndOrchestration?.length) {
      mdLines.push(`**Containers & Orchestration:** ${profile.skills.containersAndOrchestration.join(', ')}`);
    }
    if (profile.skills.ciCdAndGitOps?.length) {
      mdLines.push(`**CI/CD & GitOps:** ${profile.skills.ciCdAndGitOps.join(', ')}`);
    }
    if (profile.skills.devSecOpsAndSecurity?.length) {
      mdLines.push(`**Security & Compliance:** ${profile.skills.devSecOpsAndSecurity.join(', ')}`);
    }
    if (profile.skills.observabilityAndMonitoring?.length) {
      mdLines.push(`**Observability & Monitoring:** ${profile.skills.observabilityAndMonitoring.join(', ')}`);
    }
    if (profile.skills.programmingAndScripting?.length || profile.skills.languagesAndFrameworks?.length) {
      const progs = profile.skills.languagesAndFrameworks || profile.skills.programmingAndScripting || [];
      mdLines.push(`**Languages & Frameworks:** ${progs.join(', ')}`);
    }
    if (profile.skills.networkingAndAdmin?.length) {
      mdLines.push(`**Systems & Networking:** ${profile.skills.networkingAndAdmin.join(', ')}`);
    }

    mdLines.push('', '---', '', '## PROFESSIONAL EXPERIENCE');

    for (const exp of profile.experiences) {
      mdLines.push(`### ${exp.role} — ${exp.company}`);
      mdLines.push(`**${exp.startDate} – ${exp.endDate}** | ${exp.location}`);
      mdLines.push('');
      for (const bullet of exp.achievements) {
        mdLines.push(`- ${bullet}`);
      }
      mdLines.push('');
    }

    mdLines.push('---', '## EDUCATION & CERTIFICATIONS');
    for (const edu of profile.education) {
      mdLines.push(`- **${edu.degree}**, ${edu.institution} (${edu.year || ''})`);
    }
    for (const cert of profile.certifications) {
      mdLines.push(`- ${cert}`);
    }

    return this.compileMarkdownToPdf(mdLines.join('\n'), outputPath);
  }
}
