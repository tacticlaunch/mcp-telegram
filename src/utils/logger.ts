import chalk from 'chalk';

/**
 * Simple logger with colored output
 */
class Logger {
  /**
   * Log info message
   * @param message - Message to log
   * @param data - Optional data to log 
   */
  info(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.log(chalk.blue(`[INFO] ${timestamp} - ${message}`));
    if (data) {
      console.log(chalk.blue('  Data:'), data);
    }
  }

  /**
   * Log warning message
   * @param message - Message to log
   * @param data - Optional data to log
   */
  warn(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.log(chalk.yellow(`[WARN] ${timestamp} - ${message}`));
    if (data) {
      console.log(chalk.yellow('  Data:'), data);
    }
  }

  /**
   * Log error message
   * @param message - Message to log
   * @param data - Optional data to log
   */
  error(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.error(chalk.red(`[ERROR] ${timestamp} - ${message}`));
    if (data) {
      console.error(chalk.red('  Data:'), data);
    }
  }

  /**
   * Log debug message (only if NODE_ENV is not production)
   * @param message - Message to log
   * @param data - Optional data to log
   */
  debug(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'production') return;
    
    const timestamp = new Date().toISOString();
    console.log(chalk.gray(`[DEBUG] ${timestamp} - ${message}`));
    if (data) {
      console.log(chalk.gray('  Data:'), data);
    }
  }
}

export const logger = new Logger(); 