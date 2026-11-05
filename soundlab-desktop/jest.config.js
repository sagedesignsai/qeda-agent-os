module.exports = {
  modulePathIgnorePatterns: ['<rootDir>/release/app/package.json'],
  moduleDirectories: ['node_modules', 'release/app/node_modules', 'src'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],
  moduleNameMapper: {
    '\\.svg\\?react$': '<rootDir>/.erb/mocks/svgComponentMock.js',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga|ogg)(\\?url)?$':
      '<rootDir>/.erb/mocks/fileMock.js',
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
    // TypeScript ESM-style relative imports ('./x.js' for './x.ts').
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // ESM-only packages that Jest cannot require directly.
    '^nanoid$': '<rootDir>/.erb/mocks/nanoidMock.js',
    '^electron$': '<rootDir>/.erb/mocks/electronMock.js',
    '^@ai-sdk/(.*)$': '<rootDir>/.erb/mocks/aiMock.js',
    '^ai$': '<rootDir>/.erb/mocks/aiMock.js',
  },
  setupFiles: ['./.erb/scripts/check-build-exists.ts'],
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    url: 'http://localhost/',
  },
  testPathIgnorePatterns: ['release/app/dist', '.erb/dll'],
  transform: {
    '\\.(ts|tsx|js|jsx)$': [
      'ts-jest',
      {
        isolatedModules: true,
      },
    ],
  },
};
