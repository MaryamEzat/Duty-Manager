import { getRepository } from '../repositories/repository.js';
export const getHandoverReadiness = id => getRepository().getHandoverReadiness(id);
export const saveFinalReview = (id,note) => getRepository().saveFinalReview(id,note);
export const submitHandover = id => getRepository().submitHandover(id);
export const getCarryOverResponsibilities = id => getRepository().getCarryOverResponsibilities(id);
