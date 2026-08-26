import { getCommandCenterSnapshot } from '../services/command-center-service.js';
export const loadCommandCenter = filters => getCommandCenterSnapshot(filters);
