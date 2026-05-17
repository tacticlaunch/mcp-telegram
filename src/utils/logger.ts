import chalk from 'chalk';

/**
 * Simple logger with colored output.
 *
 * All output goes to stderr so it never corrupts the stdio JSON-RPC stream
 * used by the MCP transport (stdout is reserved for protocol messages).
 */
class Logger {
  info(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.error(chalk.blue(`[INFO] ${timestamp} - ${message}`));
    if (data) {
      console.error(chalk.blue('  Data:'), data);
    }
  }

  warn(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.error(chalk.yellow(`[WARN] ${timestamp} - ${message}`));
    if (data) {
      console.error(chalk.yellow('  Data:'), data);
    }
  }

  error(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.error(chalk.red(`[ERROR] ${timestamp} - ${message}`));
    if (data) {
      console.error(chalk.red('  Data:'), data);
    }
  }

  debug(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'production') return;

    const timestamp = new Date().toISOString();
    console.error(chalk.gray(`[DEBUG] ${timestamp} - ${message}`));
    if (data) {
      console.error(chalk.gray('  Data:'), data);
    }
  }
}

export const logger = new Logger();
