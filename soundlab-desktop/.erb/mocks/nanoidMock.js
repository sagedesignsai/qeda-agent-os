let counter = 0;
module.exports = { nanoid: () => `test-id-${(counter += 1)}` };
