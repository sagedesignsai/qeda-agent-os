const { createRequire } = require('node:module');
const toolingRequire = createRequire(
  require.resolve('./.erb/tooling/package.json'),
);

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
    '^@streamdown/(cjk|code|math|mermaid)$':
      '<rootDir>/.erb/mocks/streamdownPluginsMock.js',
    '^streamdown$': '<rootDir>/.erb/mocks/streamdownMock.js',
    '^nanoid$': '<rootDir>/.erb/mocks/nanoidMock.js',
    '^react-resizable-panels$': '<rootDir>/.erb/mocks/resizablePanelsMock.js',
    '^use-stick-to-bottom$': '<rootDir>/.erb/mocks/useStickToBottomMock.js',
    '^@react-pdf/renderer$': '<rootDir>/.erb/mocks/reactPdfMock.js',
    '^shiki$': '<rootDir>/.erb/mocks/shikiMock.js',
    '^electron$': '<rootDir>/.erb/mocks/electronMock.js',
    '^@opencode/client(/.*)?$': '<rootDir>/.erb/mocks/opencodeClientMock.js',
    '^@nut-tree-fork/nut-js$': '<rootDir>/.erb/mocks/nutJsMock.js',
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
    // The plugin has its own tsconfig (ESNext for OpenCode). Jest needs it
    // emitted as CommonJS under its own test runner.
    '^<rootDir>/plugins/qeda-builder/src/.*\\.ts$': [
      toolingRequire.resolve('ts-jest'),
      {
        compiler: toolingRequire.resolve('typescript'),
        tsconfig: {
          isolatedModules: true,
          module: 'CommonJS',
          moduleResolution: 'Node',
          target: 'ES2022',
          esModuleInterop: true,
          types: ['node'],
        },
      },
    ],
    '\\.(ts|tsx|js|jsx)$': [
      toolingRequire.resolve('ts-jest'),
      {
        compiler: toolingRequire.resolve('typescript'),
        tsconfig: {
          isolatedModules: true,
        },
      },
    ],
  },
};
