/**
 * .erb/mocks/reactPdfMock.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Jest mock for @react-pdf/renderer (ESM-only package in Jest's CommonJS jsdom).
 * Emits passthrough DOM components and mock pdf/usePDF hooks for unit testing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const React = require('react');

const passthrough = (tag) =>
  function Passthrough({ children, render, style, ...rest }) {
    if (typeof render === 'function') {
      return React.createElement(
        tag,
        { ...rest, 'data-pdf-element': tag },
        render({ pageNumber: 1, totalPages: 1 }),
      );
    }
    return React.createElement(
      tag,
      { ...rest, 'data-pdf-element': tag },
      children,
    );
  };

module.exports = {
  Document: passthrough('div'),
  Page: passthrough('div'),
  View: passthrough('div'),
  Text: passthrough('span'),
  Link: passthrough('a'),
  Image: passthrough('img'),
  Svg: passthrough('svg'),
  Path: passthrough('path'),
  Line: passthrough('line'),
  Rect: passthrough('rect'),
  Circle: passthrough('circle'),
  StyleSheet: {
    create: (styles) => styles,
  },
  Font: {
    register: () => {},
    registerHyphenationCallback: () => {},
    registerEmojiSource: () => {},
  },
  usePDF: () => [
    {
      url: 'blob:mock-pdf',
      blob: new Blob(['%PDF-1.4 mock-pdf-bytes'], { type: 'application/pdf' }),
      loading: false,
      error: null,
    },
    () => {},
  ],
  pdf: () => ({
    toBlob: async () =>
      new Blob(['%PDF-1.4 mock-pdf-bytes'], { type: 'application/pdf' }),
    toBuffer: async () => Buffer.from('%PDF-1.4 mock-pdf-bytes'),
  }),
  PDFViewer: passthrough('iframe'),
  PDFDownloadLink: passthrough('a'),
  BlobProvider: ({ children }) =>
    children({
      blob: new Blob(['%PDF-1.4 mock-pdf-bytes'], { type: 'application/pdf' }),
      url: 'blob:mock-pdf',
      loading: false,
      error: null,
    }),
};
