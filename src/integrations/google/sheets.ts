import { readFileSync, existsSync } from 'node:fs';
import { logger } from '../../core/logger.js';
import type { Vacancy, MatchScoreEvaluation } from '../../types/index.js';

export interface ISheetsService {
  syncVacancyRow(vacancy: Vacancy, evaluation?: MatchScoreEvaluation, status?: string): Promise<{ updated: boolean; rowIndex?: number }>;
}

export class DirectGoogleSheetsService implements ISheetsService {
  private tokenPath: string;
  private spreadsheetId?: string;

  constructor(
    tokenPath: string = process.env.GOOGLE_TOKEN_PATH || './data/google_tokens.json',
    spreadsheetId?: string
  ) {
    this.tokenPath = tokenPath;
    this.spreadsheetId = spreadsheetId || process.env.GOOGLE_SPREADSHEET_ID;
  }

  hasCredentials(): boolean {
    return existsSync(this.tokenPath) && Boolean(this.spreadsheetId);
  }

  async syncVacancyRow(
    vacancy: Vacancy,
    evaluation?: MatchScoreEvaluation,
    statusOverride?: string
  ): Promise<{ updated: boolean; rowIndex?: number }> {
    const rowData = [
      vacancy.companyName,
      vacancy.title,
      vacancy.locationText,
      evaluation ? evaluation.overallScore.toString() : 'N/A',
      statusOverride || vacancy.status,
      vacancy.discoveredAt.split('T')[0],
      vacancy.sourceUrl,
      evaluation ? evaluation.matchingSkills.slice(0, 4).join(', ') : '',
    ];

    if (!this.hasCredentials()) {
      logger.info(`[Simulation/Mock Mode] Sheets sync for ${vacancy.companyName} - ${vacancy.title} (Score: ${evaluation?.overallScore ?? 'N/A'})`);
      return { updated: true, rowIndex: 1 };
    }

    try {
      const tokens = JSON.parse(readFileSync(this.tokenPath, 'utf-8'));
      const range = 'Applications!A:H';
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [rowData],
        }),
      });

      if (!resp.ok) {
        throw new Error(`Google Sheets append failed with status ${resp.status}`);
      }

      const data = await resp.json() as any;
      logger.info(`Appended row to Google Sheets: ${data.updates?.updatedRange || 'OK'}`);
      return { updated: true, rowIndex: data.updates?.updatedRows || 1 };
    } catch (err) {
      logger.warn(`Sheets sync failed: ${err}`);
      return { updated: false };
    }
  }
}
