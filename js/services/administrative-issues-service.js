import { getRepository } from '../repositories/repository.js';
export const getAdministrativeIssues = id => getRepository().getAdministrativeIssues(id);
export const getAdministrativeIssueById = id => getRepository().getAdministrativeIssue(id);
export const createAdministrativeIssue = payload => getRepository().createAdministrativeIssue(payload);
export const updateAdministrativeIssue = (id,payload) => getRepository().updateAdministrativeIssue(id,payload);
export const assignAdministrativeIssue = (id,owner) => getRepository().assignAdministrativeIssue(id,owner);
export const deriveMetrics = issues => ({currentLoad:issues.length,ownerGap:issues.filter(i=>!i.owner||i.owner==='Owner required').length,actionsDue:issues.filter(i=>['Action due','Escalated','Due this shift'].includes(i.operationalState)).length});
