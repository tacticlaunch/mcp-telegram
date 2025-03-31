import { logger } from './logger.js';

/**
 * Wraps an async function with error handling
 * 
 * @param fn The async function to wrap
 * @returns A wrapped function with error handling
 */
export function asyncErrorHandler<T, Args>(
  fn: (args: Args) => Promise<T>
): (args: Args) => Promise<T> {
  return async (args: Args): Promise<T> => {
    try {
      return await fn(args);
    } catch (error) {
      logger.error('Error in asyncErrorHandler:', error);
      throw error;
    }
  };
}

/**
 * Custom error class for validation errors
 */
export class ValidationError extends Error {
  details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
} 