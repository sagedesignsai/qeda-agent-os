/**
 * Jest mock for the `@opencode/client` and `@opencode/client/service` modules.
 *
 * These are ESM-only and cannot be required directly by Jest. Tests that
 * exercise OpenCode integration mock `Service.discover` themselves.
 */
module.exports = {
  OpenCode: { make: jest.fn() },
  Service: { discover: jest.fn(), ensure: jest.fn(), headers: jest.fn(() => ({})), stop: jest.fn() },
};