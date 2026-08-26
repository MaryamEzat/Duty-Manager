import * as service from '../services/handover-service.js';
export const summaryController = { readiness:service.getHandoverReadiness, saveReview:service.saveFinalReview, submit:service.submitHandover, carryOver:service.getCarryOverResponsibilities };
