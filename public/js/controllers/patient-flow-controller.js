import * as service from '../services/patient-flow-service.js';
export const patientFlowController = { get:service.getPatientFlow, save:service.savePatientFlow, retention:service.getRetentionPatients, createRetention:service.createRetentionPatient, updateRetention:service.updateRetentionPatient, derive:service.deriveFlow };
