import { AuxiliaryData, Course, Player } from './types';
export function validJokers(players:Player[],course:Course,aux:AuxiliaryData={}) {
  const choices=aux.jokerDeclarations?.[0];
  return !!choices && players.every(p=>choices[p.id]?.length===2 && new Set(choices[p.id]).size===2 && choices[p.id].every(h=>Number.isInteger(h)&&h>=1&&h<=course.holes.length));
}
export function validBisque(players:Player[],course:Course,aux:AuxiliaryData={}) {
  return players.every(p=>{
    const budget=Math.round(p.courseHandicaps?.[course.name]??p.handicap);
    let used=0;
    return budget>=0 && course.holes.every((_,i)=>{const event=aux.bisque?.[i+1], n=event?.strokes[p.id];if(!event?.beforePlay || !Number.isInteger(n) || n!<0 || n!>2)return false;used+=n!;return used<=budget;});
  });
}
