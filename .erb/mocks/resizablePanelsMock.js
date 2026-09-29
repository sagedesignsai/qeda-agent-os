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
  'autoSaveId',
  'collapsible',
  'collapsedSize',
  'panelRef',
  'groupRef',
  'defaultLayout',
  'onCollapse',
  'onExpand',
  'onResize',
  'onLayoutChange',
  'onLayoutChanged',
  'orientation',
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

function MockPanel({ children, panelRef, ...rest }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const handle = React.useMemo(
    () => ({
      collapse: () => {
        setCollapsed(true);
        rest.onCollapse?.();
      },
      expand: () => {
        setCollapsed(false);
        rest.onExpand?.();
      },
      getSize: () => ({ asPercentage: 20, inPixels: 200 }),
      isCollapsed: () => collapsed,
      resize: () => {},
    }),
    [collapsed, rest],
  );

  React.useEffect(() => {
    if (panelRef) {
      if (typeof panelRef === 'function') {
        panelRef(handle);
      } else {
        panelRef.current = handle;
      }
    }
  }, [panelRef, handle]);

  const props = { ...rest };
  for (const key of NON_DOM_PROPS) delete props[key];
  const kids = React.Children.toArray(children);
  return React.createElement('div', props, ...kids);
}

module.exports = {
  Group: asTag('div'),
  Panel: MockPanel,
  Separator: asTag('div'),
  useDefaultLayout: () => ({
    defaultLayout: undefined,
    onLayoutChange: () => {},
    onLayoutChanged: () => {},
  }),
  usePanelRef: () => ({
    current: {
      collapse: () => {},
      expand: () => {},
      getSize: () => ({ asPercentage: 20, inPixels: 200 }),
      isCollapsed: () => false,
      resize: () => {},
    },
  }),
  useGroupRef: () => ({
    current: {
      getLayout: () => ({}),
      setLayout: () => {},
    },
  }),
};
