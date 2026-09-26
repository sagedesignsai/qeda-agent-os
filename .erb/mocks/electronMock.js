/**
 * Jest mock for the `electron` module.
 *
 * The main-process stores import getDb() from db/client.ts, which imports
 * `electron` at module scope. Unit tests exercise those stores against an
 * in-memory database via useTestDatabase(), so a stub is enough — nothing in
 * the tested paths calls into electron APIs at import time.
 */
module.exports = {
  app: {
    getPath: (name) => `/tmp/docugent-test/${name}`,
    isPackaged: false,
    whenReady: () => Promise.resolve(),
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value) => Buffer.from(value, 'utf8'),
    decryptString: (buffer) => buffer.toString('utf8'),
  },
};
