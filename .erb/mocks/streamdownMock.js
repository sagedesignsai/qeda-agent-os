// `streamdown` is ESM-only. Tests only need the text to reach the DOM, so the
// markdown renderer is replaced with a passthrough element.
const React = require('react');

const Streamdown = ({ children }) =>
  React.createElement('div', { 'data-testid': 'streamdown' }, children);

module.exports = { Streamdown, default: Streamdown };
