module.exports = {
  tool: (config) => config,
  generateText: jest.fn(),
  streamText: jest.fn(),
  createGateway: jest.fn(),
  createOpenAICompatible: jest.fn(),
  openai: jest.fn(),
  anthropic: jest.fn(),
};
