// `react-resizable-panels` is ESM-only. jsdom has no layout, so the panels are
// replaced with plain passthrough elements. Library-specific props are dropped
// to avoid React DOM warnings about unknown camelCase attributes.
const React = require('react');

const NON_DOM_PROPS = [
  'defaultSize',
  'minSize',
  'maxSize',
  'groupResizeBehavior',
  'withHandle',
];

const asTag = (tag) =>
  function Passthrough({ children, ...rest }) {
    const props = { ...rest };
    for (const key of NON_DOM_PROPS) delete props[key];
    // Spread the children as individual arguments so JSX siblings keep their
    // positional identity instead of being treated as an unkeyed array.
    const kids = React.Children.toArray(children);
    return React.createElement(tag, props, ...kids);
  };

module.exports = {
  Group: asTag('div'),
  Panel: asTag('div'),
  Separator: asTag('div'),
};
