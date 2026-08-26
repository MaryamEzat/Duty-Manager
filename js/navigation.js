const routes = { home:'pages/home.html', commandCenter:'pages/command-center.html', general:'pages/general.html', hospitalEvents:'pages/hospital-events.html', administrativeIssues:'pages/administrative-issues.html', patientFlow:'pages/patient-flow.html', operations:'pages/operations.html', experience:'pages/experience.html', summary:'pages/summary.html' };
export const navigateToModule = module => { const target=routes[module]; if(target) window.location.href=target; };
export const navigateToRecord = (module,recordId) => { const target=routes[module]; if(target) window.location.href=`${target}?recordId=${encodeURIComponent(recordId)}`; };
export const navigateToHandover = handoverId => { window.location.href=`${routes.summary}?handoverId=${encodeURIComponent(handoverId)}`; };
export { routes };
