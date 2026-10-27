import { writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'AUDIT';

const SENSITIVE_PATTERNS = [
  /(?:bearer\s+)([a-zA-Z0-9_\-\.]{15,})/gi,
  /(?:api[_-]?key[:=]\s*["']?)([a-zA-Z0-9_\-]{15,})(?:["']?)/gi,
  /(?:refresh[_-]?token[:=]\s*["']?)([a-zA-Z0-9_\-]{15,})(?:["']?)/gi,
  /(?:client[_-]?secret[:=]\s*["']?)([a-zA-Z0-9_\-]{15,})(?:["']?)/gi,
  /(?:password[:=]\s*["']?)([^"'\s]{6,})(?:["']?)/gi,
];

const SENSITIVE_KEY_REGEX = /(?:password|secret|token|api[_-]?key|auth|bearer|cookie|credential|private[_-]?key|resume_?text|raw_?resume|email_?body)/i;

export function sanitizeText(text: string): string {
  let cleaned = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, (match, secret) => match.replace(secret, '[REDACTED]'));
  }
  return cleaned;
}

export function deepSanitize(val: any, depth = 0): any {
  if (depth > 6) return '[MAX_DEPTH]';
  if (val === null || val === undefined) return val;

  if (typeof val === 'string') {
    return sanitizeText(val);
  }

  if (Array.isArray(val)) {
    return val.map(item => deepSanitize(item, depth + 1));
  }

  if (typeof val === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (SENSITIVE_KEY_REGEX.test(k)) {
        cleaned[k] = '[REDACTED]';
      } else {
        cleaned[k] = deepSanitize(v, depth + 1);
      }
    }
    return cleaned;
  }

  return val;
}

export class Logger {
  private logDir: string;
  private logFile: string;
  private auditFile: string;

  constructor(baseDir: string = process.cwd()) {
    this.logDir = join(baseDir, 'logs');
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true, mode: 0o700 });
    }
    this.logFile = join(this.logDir, 'platform.log');
    this.auditFile = join(this.logDir, 'audit.log');
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    const isJson = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';
    const sanitizedMsg = sanitizeText(message);
    const sanitizedMeta = meta ? deepSanitize(meta) : undefined;

    let line: string;
    if (isJson) {
      line = JSON.stringify({
        timestamp,
        level,
        message: sanitizedMsg,
        ...(sanitizedMeta ? { meta: sanitizedMeta } : {}),
      }) + '\n';
    } else {
      const metaStr = sanitizedMeta ? ` | ${JSON.stringify(sanitizedMeta)}` : '';
      line = `[${timestamp}] [${level}] ${sanitizedMsg}${metaStr}\n`;
    }

    if (level === 'ERROR') {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }

    try {
      appendFileSync(this.logFile, line, { mode: 0o600 });
      if (level === 'AUDIT') {
        appendFileSync(this.auditFile, line, { mode: 0o600 });
      }
    } catch {
      // Fallback if filesystem write fails
    }
  }

  debug(msg: string, meta?: Record<string, unknown>) {
    this.write('DEBUG', msg, meta);
  }

  info(msg: string, meta?: Record<string, unknown>) {
    this.write('INFO', msg, meta);
  }

  warn(msg: string, meta?: Record<string, unknown>) {
    this.write('WARN', msg, meta);
  }

  error(msg: string, meta?: Record<string, unknown>) {
    this.write('ERROR', msg, meta);
  }

  audit(action: string, actor: string, details: Record<string, unknown>) {
    this.write('AUDIT', `ACTION: ${action} by ${actor}`, details);
  }
}

export const logger = new Logger();
