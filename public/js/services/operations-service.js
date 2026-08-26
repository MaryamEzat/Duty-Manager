import { getRepository } from '../repositories/repository.js';
export const getOperationalExceptions = id => getRepository().getOperationalExceptions(id);
export const getOperationalExceptionById = id => getRepository().getOperationalException(id);
export const createOperationalException = payload => getRepository().createOperationalException(payload);
export const updateOperationalException = (id,payload) => getRepository().updateOperationalException(id,payload);
