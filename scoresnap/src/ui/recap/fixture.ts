import { calculateSettlement } from '../../engine/settlement';
import { buildRecapModel } from './model';

const course = { name: 'Sunday at the Pines', holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 380 })) };
const players = ['Alex Rivera', 'Jordan Lee', 'Sam Chen', 'Casey Park'].map((name, i) => ({
  id: String(i), name, handicap: [6, 12, 18, 24][i],
  scores: Array.from({ length: 18 }, (_, hole) => i === 0 ? (hole % 3 === 0 ? 3 : 4) : 4 + Math.floor(i / 2) + (hole % 3 === 0 ? 1 : 0)),
}));
export const sampleRecap = buildRecapModel(
  calculateSettlement(players, course, ['skins', 'nassau'], 10),
  { title: 'Sunday Skins', course: course.name, games: ['skins', 'nassau'], completed: true, scorecard: { course, players },
    liveUrl: 'https://example.com/r/sample-round' },
);
