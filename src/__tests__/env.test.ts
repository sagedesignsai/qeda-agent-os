jest.mock('electron', () => ({
  app: { getAppPath: () => '/test-app' },
}));
jest.mock('electron-log', () => ({
  debug: jest.fn(),
  info: jest.fn(),
}));
jest.mock('dotenv', () => ({
  config: jest.fn(() => ({})),
}));

import path from 'node:path';
import { config } from 'dotenv';
import { loadEnvironment } from '../main/env';

describe('loadEnvironment', () => {
  it('loads .env.local before shared .env defaults without overriding existing values', () => {
    const configMock = config as jest.Mock;
    configMock.mockClear();

    loadEnvironment();

    expect(
      configMock.mock.calls.map(([options]) => path.basename(options.path)),
    ).toEqual(['.env.local', '.env']);
    expect(configMock.mock.calls.every(([options]) => options.override === false)).toBe(
      true,
    );
  });
});
