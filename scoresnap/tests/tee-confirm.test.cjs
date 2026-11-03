const loadTS = require('./helpers/load-ts.cjs');
const jsx = (type, props) => ({type, props});
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
test('confirm tees appears only after selection and stays outside the padded tee list', () => {
  const states = []; let cursor = 0;
  const react = {useState: initial => {const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => states[i] = value];}, useCallback: f => f, useRef: value => ({current: value}), useEffect: () => {}};
  const Screen = loadTS({react, 'react/jsx-runtime': {jsx, jsxs: jsx},
    'react-native': new Proxy({Platform: {OS: 'ios'}}, {get: (o,k) => o[k] ?? k}),
    'lucide-react-native': new Proxy({}, {get: (_,k) => k}),
    './SafeScreen': {SheetSurface: 'SheetSurface', FullScreenSheet: 'Modal'},
    '../services/course-api': {},
  })('src/ui/CourseSearch.tsx').default;
  const render = () => {cursor = 0; return Screen({onSelect: jest.fn()});};
  render(); states[4] = true;
  states[8] = {name: 'Test Course', url: '', holes: 18, teeBoxes: [{name: 'Blue', holes: []}]};
  let tree = render(); expect(nodes(tree).filter(n => n.props?.testID === 'confirm-tees')).toHaveLength(0);
  const row = nodes(tree).find(n => n.type === 'Pressable' && typeof n.props.onPress === 'function' && nodes(n).some(c => c.type === 'Text' && Array.isArray(c.props.children) && c.props.children[0] === 'Blue'));
  expect(row).toBeDefined(); row.props.onPress(); tree = render();
  expect(nodes(tree).filter(n => n.props?.testID === 'confirm-tees')).toHaveLength(1);
  const list = nodes(tree).find(n => n.type === 'ScrollView');
  expect(list.props.contentContainerStyle.paddingBottom).toBeGreaterThanOrEqual(88);
  expect(nodes(list).some(n => n.props?.testID === 'confirm-tees')).toBe(false);
});
