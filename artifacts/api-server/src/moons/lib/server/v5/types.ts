import type {EdgeRelation, Frame, Solo, TextKind} from '../../thought.ts';
export type Emotion = {id:string;family:string;word:string;evidence:string;intensity:1|2|3};
/** edited: the user's own wording of the node; text stays the verbatim quote of the original. */
export type Node = {id:string;text:string;role:string;source:number[];empty:boolean;updates:unknown[];emotions?:Emotion[];edited?:string};
/** Who set a frame, relation or text kind: MOONS's reading, or the user's own choice (kept on restructure). */
export type By = 'moons'|'user';
export type Edge = {from:string;to:string;label?:string;rel?:EdgeRelation|null;relBy?:By};
export type Section = {id:string;heading:number|null;headingText:string;form:string;nodeIds:string[];table:unknown;frame?:Frame;frameBy?:By;solo?:Solo};
export type Verdict = 'kept'|'shifted'|'added'|'missed';
export const shiftTypes = ['condition_dropped','certainty_raised','referent_shifted','cause_added','emotion_added','premise_inserted'] as const;
export type CompareItem = {answer:number;verdict:Verdict;original:number[];note:string;shiftType?:string|null};
/** The structure layer: each part of the note against how the original builds it (structure-compare.ts). */
export type StructureComparison = {analysisCreatedAt:string;textKind:TextKind|null;
 sections:{section:string;heading:string;original:number[];origFrame:Frame|null;signals:{sentence:number;words:string}[];note:string;skipped:boolean}[];
 missed:{original:number[];frame:Frame|null;note:string}[];
 relations:{from:string;to:string;origRel:EdgeRelation;original:number[];note:string}[]};
export type Comparison = {materialEntryId:string;materialTitle:string;summary:string;items:CompareItem[];quotes:{index:number;text:string;time:number}[];structure?:StructureComparison|null};
export type CrossCheck = {materialEntryId:string;materialTitle:string;summary:string;items:CompareItem[];drift:{summary:string;items:CompareItem[]}};
export type Entry = {
 id:string;kind:'dump'|'media'|'question'|'chat'|'record';body:string;sentences:string[];planetIds:string[];createdAt:string;locked:boolean;status:string;
 title?:string;mediaType?:string;parentEntryId?:string;relation?:string;anchors?:Record<string,unknown>[];
 analysis?:{structure:string;nodes:Node[];edges:Edge[];signals:unknown[];suggestedPlanets:string[];model:string;promptVersion:string;createdAt:string;reason?:string;
  sections?:Section[];frame?:Frame;frameBy?:By;solo?:Solo;textKind?:TextKind|null;textKindBy?:By};
 comparison?:Comparison;meta?:Record<string,unknown>;
 /** Supporting originals (e.g. an AI summary): the answer read against each, and each read against the primary. */
 crossChecks?:CrossCheck[];
 [key:string]:unknown;
};
export type Message = {id:string;role:'user'|'assistant';text:string;createdAt:string;refs?:string[];draftNode?:{text:string;planetIds:string[];relation:string;originRef?:string};tagProposal?:{planetId:string;name:string;evidence:string[]};[key:string]:unknown};
export type Chat = {id:string;title:string;contextIds:string[];draft:string;messages:Message[];origin?:{kind:string;ref?:string};createdAt:string;updatedAt:string};
export type Notification = {id:string;kind:string;headline:string;evidence:string[];status:string;createdAt:string;key?:string};
export type Store = {
 version:1;entries:Entry[];planets:{id:string;name:string;color:string;position:{x:number;y:number};entryCount:number;openSignalRatio:number}[];
 chats?:Chat[];activeChatId?:string;tiles?:Record<string,unknown>[];notifications?:Notification[];
 settings?:{profileContext?:boolean;notificationKinds?:Record<string,boolean>;language?:'ko'|'en'};[key:string]:unknown;
};
export class WorkspaceError extends Error {status:number;constructor(status:number,message:string){super(message);this.status=status}}
export const now = () => new Date().toISOString();
