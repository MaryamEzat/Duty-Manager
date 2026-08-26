import * as service from '../services/hospital-events-service.js';
export const hospitalEventsController = { list:service.getEventsForHandover, get:service.getEventById, create:service.createEvent, update:service.updateEvent, counts:service.counts };
