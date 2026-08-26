export const toIso = value => value ? new Date(value).toISOString() : null;
export const displayDate = value => value ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)) : '';
