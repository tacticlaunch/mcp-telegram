/**
 * Minimal logger — all output goes to stderr so it never collides with
 * an stdio JSON-RPC stream (we don't ship stdio transport, but the rule
 * is cheap to keep).
 */
class Logger {
  info(message: string, data?: unknown): void {
    console.error(`[INFO ] ${new Date().toISOString()} ${message}`);
    if (data !== undefined) console.error(data);
  }
  warn(message: string, data?: unknown): void {
    console.error(`[WARN ] ${new Date().toISOString()} ${message}`);
    if (data !== undefined) console.error(data);
  }
  error(message: string, data?: unknown): void {
    console.error(`[ERROR] ${new Date().toISOString()} ${message}`);
    if (data !== undefined) console.error(data);
  }
  debug(message: string, data?: unknown): void {
    if (process.env.LOG_LEVEL !== 'debug') return;
    console.error(`[DEBUG] ${new Date().toISOString()} ${message}`);
    if (data !== undefined) console.error(data);
  }
}

export const logger = new Logger();
