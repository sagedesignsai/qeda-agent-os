// `nanoid` is ESM-only. Tests only need stable, unique-ish ids.
let counter = 0;

module.exports = {
  nanoid: () => `test-id-${(counter += 1)}`,
};
