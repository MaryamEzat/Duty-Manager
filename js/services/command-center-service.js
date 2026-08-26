import { getRepository } from '../repositories/repository.js';
export const getCommandCenterSnapshot = filters => getRepository().getCommandCenterSnapshot(filters);
export const getBusinessUnitSnapshots = filters => getCommandCenterSnapshot(filters).then(snapshot=>snapshot.handovers||[]);
export const getExecutiveIssues = filters => getCommandCenterSnapshot(filters).then(snapshot=>snapshot.executiveIssues||[]);
