module.exports = {
  tool: (config) => config,
  generateText: jest.fn(),
  streamText: jest.fn(),
  createGateway: jest.fn(),
  createOpenAICompatible: jest.fn(),
  openai: jest.fn(),
  anthropic: jest.fn(),
  createMCPClient: jest.fn(),
  Experimental_StdioMCPTransport: jest.fn().mockImplementation((config) => config),
  ToolLoopAgent: jest.fn(),
};
