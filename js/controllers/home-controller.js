import { getHandover, getPreviousHandover } from '../services/duty-manager-service.js';
export const loadHome = handoverId => Promise.all([getHandover(handoverId),getPreviousHandover(handoverId)]);
