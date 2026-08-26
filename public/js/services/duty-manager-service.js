import { getRepository } from '../repositories/repository.js';
export const getHandover = id => getRepository().getHandover(id);
export const saveHandover = payload => getRepository().saveHandover(payload);
export const getPreviousHandover = id => getRepository().getPreviousHandover(id);
