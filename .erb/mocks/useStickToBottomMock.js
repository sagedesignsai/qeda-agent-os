// `use-stick-to-bottom` is ESM-only and jsdom has no layout engine. The
// ai-elements Conversation frame is replaced with passthrough elements so it
// renders in tests. Library-specific props are dropped to avoid React DOM
// warnings about unknown camelCase attributes.
const React = require('react');

const NON_DOM_PROPS = ['initial', 'resize'];

const asTag = (tag) =>
  function Passthrough({ children, ...rest }) {
    const props = { ...rest };
    for (const key of NON_DOM_PROPS) delete props[key];
    // Spread children individually so JSX siblings keep positional identity.
    const kids = React.Children.toArray(children);
    return React.createElement(tag, props, ...kids);
  };

const StickToBottom = asTag('div');
StickToBottom.Content = asTag('div');

function useStickToBottomContext() {
  return {
    isAtBottom: true,
    isAtTop: true,
    scrollToBottom: () => {},
    scrollToTop: () => {},
  };
}

module.exports = { StickToBottom, useStickToBottomContext };
