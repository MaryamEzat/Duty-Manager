import * as service from '../services/experience-service.js';
export const experienceController = { list:service.getExperienceItems, get:service.getExperienceItemById, create:service.createExperienceItem, update:service.updateExperienceItem, metrics:service.deriveExperienceMetrics };
