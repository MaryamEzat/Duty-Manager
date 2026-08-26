import { getRepository } from '../repositories/repository.js';
export const getPatientFlow = id => getRepository().getPatientFlow(id);
export const savePatientFlow = (id,payload) => getRepository().savePatientFlow(id,payload);
export const getRetentionPatients = id => getRepository().getRetentionPatients(id);
export const createRetentionPatient = payload => getRepository().createRetentionPatient(payload);
export const updateRetentionPatient = (id,payload) => getRepository().updateRetentionPatient(id,payload);
export const deriveFlow = flow => ({totalAdmissions:Number(flow.erAdmissions||0)+Number(flow.opdAdmissions||0),totalDischarges:Number(flow.plannedDischarges||0)+Number(flow.unplannedDischarges||0),netFlow:Number(flow.erAdmissions||0)+Number(flow.opdAdmissions||0)-Number(flow.plannedDischarges||0)-Number(flow.unplannedDischarges||0)});
