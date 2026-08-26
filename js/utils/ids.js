export const temporaryId = prefix => `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
