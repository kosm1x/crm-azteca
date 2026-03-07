import { logger as engineLogger } from '../../engine/src/logger.js';

export const logger: typeof engineLogger = engineLogger.child({ module: 'crm' });
