import { calculateSettlement } from '../../engine/settlement';
import { buildRecapModel } from './model';

const course = { name: 'Sunday at the Pines', holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 380 })) };
const players = ['Alex Rivera', 'Jordan Lee', 'Sam Chen', 'Casey Park'].map((name, i) => ({
  id: String(i), name, handicap: 0,
  scores: Array.from({ length: 18 }, (_, hole) => i === 0 && hole % 3 === 0 ? 3 : 4),
}));
export const sampleRecap = buildRecapModel(
  calculateSettlement(players, course, ['skins', 'nassau'], 10),
  { title: 'Sunday Skins', course: course.name, games: ['skins', 'nassau'], completed: true,
    liveUrl: 'https://example.com/r/sample-round' },
);
