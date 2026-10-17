/** Injiserbar klokke. All forretningslogikk henter «nå» herfra, slik at tester kan styre tiden. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Testklokke som kan stilles og flyttes. */
export class ManualClock implements Clock {
  private t: number;
  constructor(start: Date | string) {
    this.t = new Date(start).getTime();
  }
  now(): Date {
    return new Date(this.t);
  }
  set(d: Date | string): void {
    this.t = new Date(d).getTime();
  }
  advance(ms: number): void {
    this.t += ms;
  }
}
