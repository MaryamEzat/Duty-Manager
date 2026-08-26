import { getRepository } from '../repositories/repository.js';
export const getExperienceItems = id => getRepository().getExperienceItems(id);
export const getExperienceItemById = id => getRepository().getExperienceItem(id);
export const createExperienceItem = payload => getRepository().createExperienceItem(payload);
export const updateExperienceItem = (id,payload) => getRepository().updateExperienceItem(id,payload);
export const deriveExperienceMetrics = items => ({escalatedComplaints:items.filter(i=>i.type==='Patient complaint'&&i.workflowState==='Escalated').length,escalatedOvrs:items.filter(i=>i.type==='OVR'&&i.workflowState==='Escalated').length,regulatoryVisits:items.filter(i=>i.type==='Regulatory visit').length});
