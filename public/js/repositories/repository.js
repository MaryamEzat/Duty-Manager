import { appState } from '../state/app-state.js';
import { mockRepository } from './mock-repository.js';
import { dataverseRepository } from './dataverse-repository.js';
import { repositoryInterface } from './repository-interface.js';

const repositories = { mock: mockRepository, dataverse: dataverseRepository };

export function getRepository(mode = appState.dataMode) {
  const selected = repositories[mode] || mockRepository;
  assertRepository(selected, mode);
  return selected;
}

export function registerRepository(mode, repository) {
  repositories[mode] = repository;
}

function assertRepository(repository, mode) {
  const missing = Object.values(repositoryInterface).filter(method => typeof repository[method] !== 'function');
  if (missing.length) throw new Error(`Repository "${mode}" is missing: ${missing.join(', ')}`);
}
