import { getHandover, getPreviousHandover, saveHandover } from '../services/duty-manager-service.js';
export const loadGeneral = id => Promise.all([getHandover(id), getPreviousHandover(id)]);
export const generalController = { load: loadGeneral, get: getHandover, save: saveHandover, previous: getPreviousHandover };
