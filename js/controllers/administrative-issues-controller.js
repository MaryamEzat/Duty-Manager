import * as service from '../services/administrative-issues-service.js';
export const administrativeIssuesController = { list:service.getAdministrativeIssues, get:service.getAdministrativeIssueById, create:service.createAdministrativeIssue, update:service.updateAdministrativeIssue, assign:service.assignAdministrativeIssue, metrics:service.deriveMetrics };
