import {Activity, AlarmClock, Angry, Apple, Archive, Award, Baby, Battery, BatteryLow, Bed, Bell, Bike, Book, BookOpen, Bookmark, Box, Brain, Briefcase, Calendar, CalendarDays, Camera, Car, Cat, CheckCircle, Circle, Clock, Cloud, CloudRain, Code, Coffee, Crown, CupSoda, Dog, Droplet, Dumbbell, Flag, Flame, Flower, Footprints, Frown, Gem, Gift, GlassWater, GraduationCap, Headphones, Heart, HeartPulse, Home, Hourglass, Image, Inbox, Laptop, Laugh, Leaf, Lightbulb, Lock, LockOpen, Soup, Cake, IceCreamCone, Candy, Ticket, ListChecks, Mail, MapPin, Medal, Meh, MessageCircle, Minus, Moon, Mountain, Music, NotebookPen, Package, Pause, PenLine, Pencil, Phone, PiggyBank, Pill, Plane, Play, Plus, Rocket, RotateCcw, ShoppingCart, Smile, Snowflake, Sparkles, Sprout, Square, Star, Sun, Sunrise, Sunset, Target, Thermometer, Timer, Train, Trophy, Umbrella, User, Users, Utensils, Wallet, Waves, Wind, Zap, type IconNode} from 'lucide';

// Icons for made widgets and HTML designs: Lucide (ISC licence), a curated set bundled with lit, no outside requests.
const SET: Record<string, IconNode> = {moon: Moon, sun: Sun, sunrise: Sunrise, sunset: Sunset, bed: Bed, alarm: AlarmClock, clock: Clock, timer: Timer, hourglass: Hourglass,
  coffee: Coffee, soda: CupSoda, water: GlassWater, drop: Droplet, food: Utensils, apple: Apple, pill: Pill, heart: Heart, pulse: HeartPulse, activity: Activity, gym: Dumbbell,
  bike: Bike, walk: Footprints, brain: Brain, read: BookOpen, book: Book, pencil: Pencil, pen: PenLine, notebook: NotebookPen, study: GraduationCap, work: Briefcase, laptop: Laptop,
  code: Code, music: Music, headphones: Headphones, camera: Camera, image: Image, smile: Smile, frown: Frown, meh: Meh, laugh: Laugh, angry: Angry, star: Star, sparkles: Sparkles,
  flame: Flame, zap: Zap, leaf: Leaf, flower: Flower, sprout: Sprout, cloud: Cloud, rain: CloudRain, umbrella: Umbrella, gift: Gift, lock: Lock, unlock: LockOpen, soup: Soup, cake: Cake, icecream: IceCreamCone, candy: Candy, ticket: Ticket, mail: Mail, inbox: Inbox, package: Package,
  box: Box, archive: Archive, bookmark: Bookmark, flag: Flag, target: Target, trophy: Trophy, medal: Medal, award: Award, check: CheckCircle, circle: Circle, square: Square,
  list: ListChecks, calendar: CalendarDays, date: Calendar, wallet: Wallet, piggy: PiggyBank, cart: ShoppingCart, home: Home, pin: MapPin, plane: Plane, car: Car, train: Train,
  phone: Phone, chat: MessageCircle, people: Users, user: User, baby: Baby, dog: Dog, cat: Cat, bell: Bell, idea: Lightbulb, gem: Gem, crown: Crown, rocket: Rocket,
  mountain: Mountain, waves: Waves, wind: Wind, snow: Snowflake, temp: Thermometer, battery: Battery, low: BatteryLow, play: Play, pause: Pause, reset: RotateCcw, plus: Plus, minus: Minus};
export const ICON_NAMES = Object.keys(SET);
const attr = (a: Record<string, unknown>) => Object.entries(a).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
/** The icon as an SVG string (for HTML designs) — '' for an unknown name. */
export function iconSvg(name: string, size = 20) {
  const node = SET[name];
  if (!node) return '';
  return `<svg class="lit-icon" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${((node as unknown as [string, unknown, [string, Record<string, unknown>][]])[2] ?? []).map(([tag, a]) => `<${tag} ${attr(a as Record<string, unknown>)}/>`).join('')}</svg>`;
}
export function Icon({name, size = 20}: {name: string; size?: number}) {
  const svg = iconSvg(name, size);
  return svg ? <span className="lit-icon-wrap" dangerouslySetInnerHTML={{__html: svg}} /> : name ? <span className="lit-icon-wrap emoji">{name}</span> : null;
}
