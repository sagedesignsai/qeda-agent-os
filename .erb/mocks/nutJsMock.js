module.exports = {
  mouse: {
    setPosition: jest.fn(async () => {}),
    getPosition: jest.fn(async () => ({ x: 0, y: 0 })),
    leftClick: jest.fn(async () => {}),
    doubleClick: jest.fn(async () => {}),
  },
  keyboard: {
    type: jest.fn(async () => {}),
    pressKey: jest.fn(async () => {}),
  },
  screen: {
    width: jest.fn(async () => 1920),
    height: jest.fn(async () => 1080),
  },
  Key: { Enter: 'Enter' },
  Button: { LEFT: 'LEFT' },
  sleep: jest.fn(async () => {}),
  Window: class {},
  getActiveWindow: jest.fn(async () => ({ title: 'Mock Window' })),
};
