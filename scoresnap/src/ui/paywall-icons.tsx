import Svg, { Path, Circle } from 'react-native-svg';
import { PAYWALL as P } from './paywall-tokens';
export function PaywallIcon({ name }: { name: 'close' | 'contest' | 'library' | 'live' }) {
  const paths = {
    close: ['M18 6 6 18', 'm6 6 12 12'],
    contest: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M10 9H8', 'M16 13H8', 'M16 17H8'],
    library: ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
    live: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z'],
  };
  return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={P.ink} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    {paths[name].map(d => <Path key={d} d={d} />)}{name === 'live' && <Circle cx={12} cy={10} r={3} />}
  </Svg>;
}
export function PaywallRadio({ selected }: { selected: boolean }) {
  return <Svg width={22} height={22} viewBox="0 0 22 22"><Circle cx={11} cy={11} r={10} fill={P.card} stroke={selected ? P.green : P.radioOff} strokeWidth={selected ? 2 : 1.5} />{selected && <Circle cx={11} cy={11} r={5} fill={P.green} />}</Svg>;
}
