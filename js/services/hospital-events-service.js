import { getRepository } from '../repositories/repository.js';
export const getEventsForHandover = id => getRepository().getHospitalEvents(id);
export const getEventById = id => getRepository().getHospitalEvent(id);
export const createEvent = payload => getRepository().createHospitalEvent(payload);
export const updateEvent = (id,payload) => getRepository().updateHospitalEvent(id,payload);
export const counts = events => events.reduce((out,event)=>{out.total++;out[event.severity]=(out[event.severity]||0)+1;if(event.operationalState==='Active monitoring'||event.operationalState==='Stabilised')out.active++;return out;},{total:0,Major:0,Moderate:0,Low:0,active:0});
