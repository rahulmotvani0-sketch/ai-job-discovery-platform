import { readFileSync, existsSync } from 'node:fs';
import { logger } from '../../core/logger.js';

export interface IDriveService {
  uploadResumeFile(localPath: string, fileName: string): Promise<{ fileId: string; webViewLink?: string }>;
}

export class DirectGoogleDriveService implements IDriveService {
  private tokenPath: string;

  constructor(tokenPath: string = process.env.GOOGLE_TOKEN_PATH || './data/google_tokens.json') {
    this.tokenPath = tokenPath;
  }

  hasCredentials(): boolean {
    return existsSync(this.tokenPath);
  }

  async uploadResumeFile(localPath: string, fileName: string): Promise<{ fileId: string; webViewLink?: string }> {
    if (!this.hasCredentials()) {
      logger.info(`[Simulation/Mock Mode] Drive upload for ${fileName} from ${localPath}`);
      return {
        fileId: `mock_drive_file_${Date.now()}`,
        webViewLink: `https://drive.google.com/file/d/mock_drive_file_${Date.now()}/view`,
      };
    }

    try {
      const tokens = JSON.parse(readFileSync(this.tokenPath, 'utf-8'));
      const fileContent = readFileSync(localPath);

      const metadata = {
        name: fileName,
        mimeType: 'text/markdown',
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([fileContent], { type: 'text/markdown' }));

      const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
        },
        body: form,
      });

      if (!resp.ok) {
        throw new Error(`Google Drive upload failed with status ${resp.status}`);
      }

      const data = await resp.json() as any;
      return {
        fileId: data.id,
        webViewLink: `https://drive.google.com/file/d/${data.id}/view`,
      };
    } catch (err) {
      logger.warn(`Drive upload failed, using local reference: ${err}`);
      return {
        fileId: `drive_fallback_${Date.now()}`,
      };
    }
  }
}
