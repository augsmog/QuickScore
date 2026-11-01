import { SheetSurface, FullScreenSheet } from "./SafeScreen";
import {useState} from 'react';
import {ScrollView,Text,Pressable,View} from 'react-native';
import {AuxiliaryData,Course,GameConfig,Player} from '../engine/types';
import {COLORS} from './theme';
type Kind='wolf'|'bisque'|'jokerDeclarations';
/** Public declarations are saved before scoring and locked by the store. */
export function PrePlayDeclarations({kind,players,course,hole,config,onSave,onClose}:{kind:Kind;players:Player[];course:Course;hole:number;config:GameConfig;onSave:(kind:Kind,hole:number,value:unknown)=>void;onClose:()=>void}) {
 const [choices,setChoices]=useState<Record<string,number[]>>({});
 const [wolf,setWolf]=useState<{partnerId:string|null;isLoneWolf:boolean;blind?:boolean;refused?:boolean}>();
 const button=(label:string,action:()=>void)=><Pressable key={label} onPress={action} style={{padding:14,margin:4,backgroundColor:COLORS.surfaceHigh}}><Text style={{color:COLORS.text}}>{label}</Text></Pressable>;
 const save=(value:unknown)=>{onSave(kind,kind==='jokerDeclarations'?0:hole,value);onClose();};
 return <FullScreenSheet visible transparent onRequestClose={onClose}><View testID="preplay-scrim" style={{flex:1,backgroundColor:'#000a',justifyContent:'center',padding:20}}><SheetSurface testID="preplay-sheet" centered style={{maxHeight:"85%",backgroundColor:COLORS.surfaceLow}}><ScrollView style={{padding:16}}>
 <Text style={{color:COLORS.text,fontSize:20}}>{kind==='jokerDeclarations'?'Public Joker holes — before the round':kind==='bisque'?`Bisque declarations — before hole ${hole}`:`Wolf decision — hole ${hole}`}</Text>
 <Text style={{color:COLORS.textDim}}>Confirm these decisions were agreed before play. Recorded decisions lock when scores are entered.</Text>
 {kind==='wolf'?<>
 <Text style={{color:COLORS.text}}>Wolf: {players[(hole-1)%players.length]?.name}</Text>
 {players.filter(p=>p!==players[(hole-1)%players.length]).map(p=>button(`Partner: ${p.name}`,()=>setWolf({partnerId:p.id,isLoneWolf:false})))}
 {button('Ordinary solo — 2 units per opponent',()=>setWolf({partnerId:null,isLoneWolf:true}))}
 {config.blindWolf && button('Blind — declared before anyone teed off; 3 per opponent',()=>setWolf({partnerId:null,isLoneWolf:true,blind:true}))}
 {config.pigVariation && wolf?.partnerId && button(`Selected partner ${wolf.refused?'REFUSED':'accepted'} — tap to change`,()=>setWolf({...wolf,refused:!wolf.refused}))}
 {wolf && button('Confirm pre-play Wolf decision',()=>save({...wolf,beforePlay:true}))}
 </>:players.map(p=><View key={p.id}><Text style={{color:COLORS.text}}>{p.name}{kind==='bisque'?` — course handicap ${Math.round(p.courseHandicaps?.[course.name]??p.handicap)}`:''}: {(choices[p.id]??[]).join(', ')}</Text>
 {(kind==='bisque'?[0,1,2]:course.holes.map(h=>h.num)).map(n=>button(String(n),()=>setChoices({...choices,[p.id]:kind==='bisque'?[n]:(choices[p.id]??[]).includes(n)?choices[p.id].filter(h=>h!==n):[...(choices[p.id]??[]).slice(-1),n]})))}
 </View>)}
 {kind!=='wolf' && players.every(p=>choices[p.id]?.length===(kind==='bisque'?1:2)) && button('Confirm agreed before play',()=>save(kind==='bisque'?{beforePlay:true,strokes:Object.fromEntries(players.map(p=>[p.id,choices[p.id][0]]))}:choices))}
 {button('Cancel — remains pending',onClose)}
 </ScrollView></SheetSurface></View></FullScreenSheet>;
}
