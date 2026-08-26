export const required = (value,field) => value == null || String(value).trim() ? null : `${field} is required.`;
export const nonNegative = (value,field) => Number.isFinite(Number(value)) && Number(value)>=0 ? null : `${field} must be a non-negative number.`;
export const validate = (payload,fields) => Object.fromEntries(fields.map(field=>[field,required(payload[field],field)]).filter(([,error])=>error));
