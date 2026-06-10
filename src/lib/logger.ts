/**
 * Structured logger with severity levels and correlation ID support.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info({ message: 'Transaksi created', id });
 *   logger.warn({ message: 'Rate limit approaching', remaining });
 *   logger.error({ message: 'Sheets API failed', error: String(err) });
 *
 * Correlation ID:
 *   The correlation-ID is injected by middleware into the `x-correlation-id`
 *   request header. Route handlers can pass it to logger.context() or
 *   read it directly and include it in the log metadata.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  correlationId?: string;
  message: string;
  [key: string]: unknown;
}

class Logger {
  private _correlationId?: string;

  /** Attach a correlation ID so all subsequent calls include it. */
  context(correlationId: string): Logger {
    this._correlationId = correlationId;
    return this;
  }

  /** Clear the correlation context (e.g. after request finishes). */
  clear(): void {
    this._correlationId = undefined;
  }

  debug(data: Record<string, unknown> & { message?: string }): void {
    this.emit('debug', data);
  }

  info(data: Record<string, unknown> & { message?: string }): void {
    this.emit('info', data);
  }

  warn(data: Record<string, unknown> & { message?: string }): void {
    this.emit('warn', data);
  }

  error(data: Record<string, unknown> & { message?: string }): void {
    this.emit('error', data);
  }

  private emit(level: LogLevel, data: Record<string, unknown> & { message?: string }): void {
    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      message: data.message ?? '',
      ...data,
    };

    if (this._correlationId) {
      entry.correlationId = this._correlationId;
    }

    const line = JSON.stringify(entry);

    switch (level) {
      case 'debug':
        console.debug(line);
        break;
      case 'info':
        console.info(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'error':
        console.error(line);
        break;
      default:
        console.log(line);
    }
  }
}

/** Singleton logger — import `logger` wherever you need structured output. */
export const logger = new Logger();