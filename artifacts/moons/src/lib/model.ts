import {validUniverse,isBaseline,type UniverseState,type UniverseView,type SpatialBaseline} from './universe.ts';
import {isChat,type ChatThread,type Profile} from './chat.ts';
import {tr} from './i18n.ts';
import type {FormTemplate} from './forms.ts';
import type {Project,Task,Session,Confidence} from './planner.ts';
import type {Notation} from './notation.ts';
import type {EdgeRelation,Frame,Solo,TextKind} from './thought.ts';
export type MediaType = 'book' | 'paper' | 'article' | 'video' | 'custom';
export const structures = ['개요','지식나열','인과구조','비교구조','주장-근거','이항대립','문학','IRAC','ANT'] as const;
export type Structure = typeof structures[number];
export const structureLabels:Record<Structure,string> = {'개요':tr('Outline'),'지식나열':tr('Knowledge map'),'인과구조':tr('Cause & effect'),'비교구조':'Comparison','주장-근거':tr('Claim & evidence'),'이항대립':tr('Opposing ideas'),'문학':'Literary','IRAC':'IRAC','ANT':tr('Actor network')};
export type Update = {id:string;text:string;createdAt:string;recheck?:{resolved:boolean;reason:string}};
export type GNode = {emotions?:Emotion[];id:string;text:string;role:string;source:number[];empty:boolean;updates:Update[];hesitant?:boolean;
  /** The user's own wording of this node (a typo fixed, a word changed). text stays the verbatim quote of the original. */
  edited?:string;
  /** Set only after an impostor reveal: kept by the user, or kept as fog while they are unsure. */
  adoptedFromImpostor?:boolean;fog?:boolean};
export type Signal = {id:string;nodeId:string;kind:'misunderstanding'|'study'|'gap';reason:string;state:'open'|'resolved'|'dismissed'};
/** One part of an outline note: the user's heading line (or an empty slot) and how its lines are drawn. */
export type SectionForm='diagram'|'tree'|'table'|'lines';
/** Who set a frame, relation or text kind: MOONS's reading, or the user's own choice (kept on restructure). */
export type By='moons'|'user';
export type Section={id:string;heading:number|null;headingText:string;form:SectionForm;nodeIds:string[];table:{columns:string[];rows:{item:string|null;cells:(string|null)[]}[]}|null;frame?:Frame;frameBy?:By;solo?:Solo;signals?:string[];original?:number[]};
/** role and claimIds come with structuring v3: the frame's own relations are the spine, every line stands on claims. */
export type Edge={from:string;to:string;label?:string;rel?:EdgeRelation|null;relBy?:By;role?:'spine'|'cross';claimIds?:string[]};
export type Claim={id:string;subj:string;pred:string;obj:string;sentences:number[];kind:'explicit'|'implied';marker?:string};
export type MapQuality={claims:number;coverage:number;ungrounded:number;uncovered:number[];orphans?:string[];retried:boolean};
export type Analysis = {sections?:Section[];structure:Structure;nodes:GNode[];edges:Edge[];signals:Signal[];suggestedPlanets:string[];model:string;promptVersion:string;createdAt:string;suggestedTitle?:string;
  frame?:Frame;frameBy?:By;solo?:Solo;textKind?:TextKind|null;textKindBy?:By;version?:3;claims?:Claim[];quality?:MapQuality;order?:number[];dump?:DumpLayer};
export type Anchor={kind:'time';seconds:number}|{kind:'page';page:number}|{kind:'url';url:string;selector?:string}|{kind:'message';index:number;role:'user'|'assistant'}|{kind:'none'};
export type Emotion={id:string;family:string;word:string;evidence:string;intensity:1|2|3};
export type Verdict='kept'|'shifted'|'added'|'missed';
export type ComparisonItem={answer:number|string;verdict:Verdict;original:number[];note:string;shiftType?:string|null};
/** A supporting original (e.g. an AI summary): the answer read against it, and it read against the primary. */
export type CrossCheck={materialEntryId:string;materialTitle:string;summary:string;items:ComparisonItem[];drift:{summary:string;items:ComparisonItem[]}};
/** The structure layer: each part of the note against how the original builds it, read from the original's signals. */
export type StructureComparison={analysisCreatedAt:string;textKind:TextKind|null;
  sections:{section:string;heading:string;original:number[];origFrame:Frame|null;signals:{sentence:number;words:string}[];note:string;skipped:boolean}[];
  missed:{original:number[];frame:Frame|null;note:string}[];
  relations:{from:string;to:string;origRel:EdgeRelation;original:number[];note:string}[]};
export type Comparison={materialEntryId:string;materialTitle:string;summary:string;items:ComparisonItem[];quotes:{index:number;text:string;time:number}[];structure?:StructureComparison|null;concepts?:{shared:string[];missed:string[];added:string[]};next?:NextCard[]};
/** v7 6.3: what to look into next, one card per missed or shifted sentence, leap, or concept never explained. */
export type NextCard={target:{kind:'missed'|'shifted'|'gap'|'concept';ref:string};question:string;concepts:string[];why:number[]};
export type Knowledge='seen'|'organized'|'checked'|'explainable';
/** v7 6.2: the user's dump taken down as said, with a separate (hidden) assessment. */
export type DumpLayer={claims:{id:string;subj:string;obj:string;asserted:string|null;sentences:number[];subjNode?:string;objNode?:string;assessment?:{verdict:'holds'|'questionable'|'unsupported';why:string}}[];senses:{term:string;senses:{label:string;sentences:number[]}[]}[];gaps:{from:string;to:string;sentences:number[];missing:string;fromNode?:string;toNode?:string}[];model:string;createdAt:string};
export type IntentCheck={targetType:'node'|'emotion';targetId:string;verdict:'agree'|'mean';comment?:string};
export type Relation='updates'|'contradicts'|'extends';
/** A connection the user made between two notes, with a reason in their own words. */
export type NodeLink={id:string;from:string;to:string;relation:Relation|'related';reason:string;createdAt:string};
export type Tile={id:string;name:string;icon:string;adapters:string[];defaultPlanet?:string;fields:string[];position:number};
export type Notice={id:string;kind:string;headline:string;evidence:string[];status:'new'|'seen'|'dismissed';createdAt:string;key?:string};
export type Settings={showSatellites?:boolean;satelliteAgent?:{minHours?:number;maxRecords?:number};profileContext:boolean;notificationKinds:Record<string,boolean>;language?:'ko'|'en';impostor?:'off'|'rare'|'sometimes'|'often';
  /** Satellites switched on (lib/satellites.ts). Unset: worked out from what the user already uses. */
  satellites?:string[];satelliteInstalls?:import('@workspace/moons-sync/satellites').DeviceSettings['satelliteInstalls']};
export const noticeKinds=['breaking_news','bias_watch','adjustment','spy_reveal','source_ready'] as const;
export const defaultSettings=():Settings=>({profileContext:true,notificationKinds:Object.fromEntries(noticeKinds.map(k=>[k,true]))});
export const defaultTiles=():Tile[]=>[{id:'tile-dump',name:'Dump',icon:'Flame',adapters:['dump'],fields:['title'],position:0},{id:'tile-book',name:'Book',icon:'BookOpen',adapters:['dump'],fields:['title','author','date'],position:1},{id:'tile-article',name:'Article',icon:'Newspaper',adapters:['url','dump'],fields:['title','url'],position:2},{id:'tile-audio',name:'Audio / Video',icon:'Mic',adapters:['audio'],fields:['title'],position:3}];
export type Entry = {revision?:import('./concepts').Revision;projectIds?:string[];knowledge?:Knowledge;anchors?:Anchor[];comparison?:Comparison;crossChecks?:CrossCheck[];checks?:IntentCheck[];parentEntryId?:string;relation?:Relation;id:string;kind:'dump'|'media'|'question'|'chat'|'record';mediaType?:MediaType;title?:string;meta?:{author?:string;publishedAt?:string;readAt?:string;url?:string;source?:string;doi?:string;[key:string]:unknown};body:string;sentences:string[];locked:boolean;createdAt:string;analysis?:Analysis;analyses?:Analysis[];status:'saved'|'analyzing'|'done'|'failed';planetIds:string[];example?:boolean;
  /** What the user did with each MOONS comment, by comment key (lib/structure.ts). */
  commentStates?:Record<string,'applied'|'kept'>};
export type Planet = {id:string;name:string;position:{x:number;y:number};entryCount:number;openSignalRatio:number;color:string};
export type Store = {version:1;entries:Entry[];planets:Planet[];universe?:UniverseState;views?:UniverseView[];profile?:Profile;chats?:ChatThread[];activeChatId?:string;baselines?:SpatialBaseline[];tiles?:Tile[];forms?:FormTemplate[];links?:NodeLink[];notation?:Notation[];projects?:Project[];tasks?:Task[];sessions?:Session[];confidence?:Confidence[];notifications?:Notice[];settings?:Settings;concepts?:import("./concepts").Concept[];memos?:import("./concepts").Memo[];artifacts?:import("./chat-notes").Artifact[];exploreMaps?:import("./chat-notes").ExploreMap[];satellites?:import("./satellite-spaces").Space[]};
export const uid = () => crypto.randomUUID();
/** What a node shows: the user's own correction when there is one, else the quote. */
export const nodeText=(n:{text:string;edited?:string})=>n.edited??n.text;
/** Renames a node like a file: the quote stays underneath. The same words as the quote (or nothing) undo the edit. */
export function renameNode(a:Analysis,id:string,next:string):Analysis{const t=next.replace(/\s+/g,' ').trim().slice(0,500);return {...a,nodes:a.nodes.map(n=>{if(n.id!==id)return n;const {edited:_,...rest}=n;return !t||t===n.text?rest:{...rest,edited:t}})}}
import {splitSentences} from './thought.ts';
export {splitSentences};
export function makeEntry(body:string, extras:Partial<Entry> = {}):Entry {return {...extras,id:uid(),kind:extras.kind??'dump',body,sentences:splitSentences(body),locked:true,createdAt:new Date().toISOString(),status:'saved',planetIds:extras.planetIds??[]};}
const roles:Record<Structure,string[]>={'개요':['Idea',tr('Related idea'),tr('Open question')],'지식나열':['Idea',tr('Related idea'),tr('Open question')],'인과구조':['Cause','Process','Effect'],'비교구조':[tr('First perspective'),tr('Second perspective'),'Criteria'],'주장-근거':['Claim','Evidence',tr('Supporting detail')],'이항대립':[tr('One side'),tr('Other side'),'Question'],'문학':['Scene',tr('Character and emotion'),'Interpretation'],'IRAC':['Issue','Rule','Facts','Application','Conclusion'],'ANT':['Actor','Relationship',tr('Another actor')]};
// UI fixture only: no semantic assessment and no external AI request.
export function mockAnalysis(entry:Entry, structure:Structure='지식나열'):Analysis {
 const nodes:GNode[]=entry.sentences.map((text,i)=>({id:uid(),text,role:roles[structure][i%roles[structure].length],source:[i],empty:false,updates:[]}));
 const blank:GNode={id:uid(),text:'',role:roles[structure].at(-1)!,source:[],empty:true,updates:[]}; nodes.push(blank);
 return {structure,nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),signals:[{id:uid(),nodeId:blank.id,kind:'study',reason:tr('Demo placeholder, not an AI-detected knowledge gap.'),state:'open'},...(entry.example&&nodes.length>2?[{id:uid(),nodeId:nodes[1].id,kind:'misunderstanding' as const,reason:tr('Example signal for testing the UI, not a factual assessment.'),state:'open' as const}]:[])],suggestedPlanets:[],model:'local-ui-demo',promptVersion:'mock-v1',createdAt:new Date().toISOString()};
}
export function addUpdate(entry:Entry,nodeId:string,text:string):Entry {
 if(!entry.analysis||!text.trim()) return entry;
 return {...entry,analysis:{...entry.analysis,nodes:entry.analysis.nodes.map(n=>n.id===nodeId?{...n,updates:[...n.updates,{id:uid(),text:text.trim(),createdAt:new Date().toISOString()}]}:n)}};
}
export function tagEntry(entry:Entry,planetIds:string[]):Entry{return {...entry,planetIds:[...new Set(planetIds)]};}
export function withStats(store:Store):Store {return {...store,planets:store.planets.map(p=>{const entries=store.entries.filter(e=>e.planetIds.includes(p.id));const signals=entries.flatMap(e=>e.analysis?.signals??[]);return {...p,entryCount:entries.length,openSignalRatio:signals.length?signals.filter(s=>s.state==='open').length/signals.length:0};})};}
export function initialStore():Store {return {version:1,entries:[],planets:[{id:'p-learning',name:'Learning',position:{x:29,y:39},entryCount:0,openSignalRatio:0,color:'#adc5ef'},{id:'p-creative',name:'Creative',position:{x:71,y:61},entryCount:0,openSignalRatio:0,color:'#d3c6ec'},{id:'p-everyday',name:'Everyday',position:{x:55,y:24},entryCount:0,openSignalRatio:0,color:'#c9dccb'}]};}
export function exampleEntries():Entry[]{return [makeEntry('좋은 질문은 정답을 찾는 것보다 오래 남는다. 알고 있다고 생각한 것을 내 말로 설명하면 빈 곳이 보인다. 그 빈 곳부터 다시 배워보고 싶다.',{title:'내 말로 설명한다는 것',example:true,planetIds:['p-learning']}),makeEntry('산책할 때는 생각이 조금 느슨해진다. 목적 없이 걷는 시간이 오히려 새로운 아이디어를 데려오는 것 같다.',{title:'산책과 생각 사이',kind:'media',mediaType:'book',meta:{author:'예시 저자'},example:true,planetIds:['p-creative','p-everyday']}),makeEntry('오늘은 완성하지 않아도 기록하기. 작게 남긴 생각들이 언젠가 서로 연결되지 않을까?',{title:'작은 기록의 힘',example:true,planetIds:['p-everyday']})];}
export function parseStore(raw:string):Store {const value=JSON.parse(raw);if(value?.version!==1||!Array.isArray(value.entries)||!Array.isArray(value.planets)||!value.entries.every((e:Entry)=>typeof e.id==='string'&&typeof e.body==='string'&&Array.isArray(e.sentences)&&Array.isArray(e.planetIds))||!value.planets.every((p:Planet)=>typeof p.id==='string'&&typeof p.name==='string'&&Number.isFinite(p.position?.x)&&Number.isFinite(p.position?.y)))throw Error('저장 형식이 맞지 않습니다.');return withStats({...value,baselines:Array.isArray(value.baselines)?value.baselines.filter(isBaseline):[],chats:Array.isArray(value.chats)?value.chats.map((c:ChatThread)=>c&&typeof c==='object'?{...c,draft:typeof c.draft==='string'?c.draft:'',contextIds:Array.isArray(c.contextIds)?c.contextIds:[]}:c).filter(isChat):[],tiles:Array.isArray(value.tiles)?value.tiles.filter((t:Tile)=>t&&typeof t.id==='string'&&typeof t.name==='string'):undefined,notifications:Array.isArray(value.notifications)?value.notifications.filter((n:Notice)=>n&&typeof n.id==='string'&&typeof n.headline==='string'):[],settings:value.settings&&typeof value.settings==='object'?{...defaultSettings(),...value.settings,notificationKinds:{...defaultSettings().notificationKinds,...(value.settings.notificationKinds??{})}}:undefined,profile:typeof value.profile?.username==='string'&&typeof value.profile?.displayName==='string'?value.profile:undefined,activeChatId:typeof value.activeChatId==='string'?value.activeChatId:undefined,universe:validUniverse(value.universe)?value.universe:undefined,views:Array.isArray(value.views)?value.views.filter((v:UniverseView)=>validUniverse(v)&&typeof v.id==='string'&&typeof v.name==='string'):[],entries:value.entries.map((e:Entry)=>e.status==='analyzing'?{...e,status:'failed'}:e)});}

// New workspaces are created with English default names. For a Korean UI, rename only
// untouched defaults once (same id and same English name); user-renamed items stay as typed.
const DEFAULT_NAMES:Record<string,string>={'p-learning':'Learning','p-creative':'Creative','p-everyday':'Everyday',dump:'Dump',book:'Book',article:'Article',audio:'Audio / Video','tile-dump':'Dump','tile-book':'Book','tile-article':'Article','tile-audio':'Audio / Video'};
export function localizeDefaults(store:Store,translate:(en:string)=>string):Store|null{
  const rename=<T extends {id:string;name:string}>(items:T[]|undefined)=>{let changed=false;const next=(items??[]).map(i=>{if(DEFAULT_NAMES[i.id]!==i.name)return i;const name=translate(i.name);if(name===i.name)return i;changed=true;return {...i,name}});return {next,changed}};
  const planets=rename(store.planets),tiles=rename(store.tiles);
  if(!planets.changed&&!tiles.changed)return null;
  return {...store,planets:planets.next,...(store.tiles?{tiles:tiles.next}:{})};
}
