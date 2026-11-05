module.exports = {
  app: {
    getPath: (name) => `/tmp/soundlab-test/${name}`,
    isPackaged: false,
    whenReady: () => Promise.resolve(),
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value) => Buffer.from(value, 'utf8'),
    decryptString: (buffer) => buffer.toString('utf8'),
  },
};
