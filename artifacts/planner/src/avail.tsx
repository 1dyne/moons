import {createContext, useContext} from 'react';
import {availableOn, type Availability} from '@workspace/life-contract';

// The user's focus availability (설정 → 집중 가능 시간). Plans and bottlenecks use it when set.
const Ctx = createContext<Availability | null>(null);
export const AvailabilityProvider = Ctx.Provider;
export const useAvailability = () => useContext(Ctx);
/** Capacity per day for goalSchedule, or undefined to fall back to the weekly figure. */
export const usePerDay = () => { const av = useContext(Ctx); return av ? (d: string) => availableOn(av, d) : undefined; };
