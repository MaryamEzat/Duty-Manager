import * as service from '../services/operations-service.js';
export const operationsController = { list:service.getOperationalExceptions, get:service.getOperationalExceptionById, create:service.createOperationalException, update:service.updateOperationalException };
