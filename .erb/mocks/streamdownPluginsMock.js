// The @streamdown/* packages are ESM-only, which Jest (CommonJS) cannot
// resolve. They only supply remark/rehype plugin factories, so identity
// factories are enough for component tests.
const plugin = () => ({});

module.exports = { cjk: plugin, code: plugin, math: plugin, mermaid: plugin };
