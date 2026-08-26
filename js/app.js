import { appState, setDataMode } from './state/app-state.js';
import { routes } from './navigation.js';
export function boot({dataMode=appState.dataMode}={}){ setDataMode(dataMode); if (typeof document !== 'undefined') document.documentElement.dataset.dataMode=appState.dataMode; return {mode:appState.dataMode,routes}; }
if(typeof window!=='undefined') window.DutyManagerDataReady={boot,appState,routes};

