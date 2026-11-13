/** An event waiting for its released value. */
export interface EventRef { id: string; title: string; country: string; at: string; forecast: string | null; previous: string | null }
export interface ActualObservation { eventId: string; actual: string; source: string }

/** One place that publishes released values; it answers only for the events it recognises, never guesses, and returns nothing when the value is not out yet. */
export interface ActualsSource { fetch(events: EventRef[], signal: AbortSignal): Promise<ActualObservation[]> }
