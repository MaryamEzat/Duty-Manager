export const appState = {
  dataMode: initialDataMode(),
  handoverId: readParam('handoverId') || localStorageValue('dm_current_handover_id') || 'mock-handover-current',
  filters: {},
  readiness: null
};

export function setDataMode(mode) {
  appState.dataMode = mode === 'dataverse' ? 'dataverse' : 'mock';
  try { localStorage.setItem('dm_data_mode', appState.dataMode); } catch {}
}

export function setCurrentHandoverId(id) {
  if (!id) return;
  appState.handoverId = id;
  try { localStorage.setItem('dm_current_handover_id', id); } catch {}
}

function initialDataMode() {
  const mode = readParam('dataMode') || readParam('provider') || localStorageValue('dm_data_mode') || 'mock';
  return mode === 'dataverse' ? 'dataverse' : 'mock';
}

function readParam(name) {
  try { return new URLSearchParams(location.search).get(name); } catch { return ''; }
}

function localStorageValue(key) {
  try { return localStorage.getItem(key); } catch { return ''; }
}
