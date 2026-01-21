import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map, shareReplay } from 'rxjs/operators';

export type TimePreset = "15d" | "30d" | "90d" | "custom";

export class TimeFilter {

  constructor(
  public readonly preset: TimePreset,
  public readonly from: Date,
  public readonly to: Date,
  ){

  }

  public equals(filter: TimeFilter): boolean {
    return false;
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function subDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - days);
  return x;
}

function eqTimeFilter(a: TimeFilter, b: TimeFilter): boolean {
  return (
    a.preset === b.preset &&
    a.from.getTime() === b.from.getTime() &&
    a.to.getTime() === b.to.getTime()
  );
}

@Injectable({ providedIn: 'root' })
export class TimeFilterService {
  private readonly subject = new BehaviorSubject<TimeFilter>(
    this.buildPresetFilter('15d')
  );

  /** Stream principal para consumir desde el mapa */
  readonly timeFilter$: Observable<TimeFilter> = this.subject.asObservable().pipe(
    distinctUntilChanged(eqTimeFilter),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  /** Derivados útiles (opcional) */
  readonly from$: Observable<Date> = this.timeFilter$.pipe(map(x => x.from));
  readonly to$: Observable<Date> = this.timeFilter$.pipe(map(x => x.to));
  readonly preset$: Observable<TimePreset> = this.timeFilter$.pipe(map(x => x.preset));

  getSnapshot(): TimeFilter {
    return this.subject.value;
  }

  setPreset(preset: TimePreset): void {
    if (preset === 'custom') {
      const current = this.subject.value;
      this.subject.next(new TimeFilter(
        'custom', current.from, current.to,
      ));
      return;
    }

    this.subject.next(this.buildPresetFilter(preset));
  }

  setCustomRange(start: Date | null, end: Date | null): void {
    if (!start || !end) return;

    this.subject.next(new TimeFilter('custom', startOfDay(start), endOfDay(end) ));
  }

  public buildPresetFilter(preset: Exclude<TimePreset, 'custom'>): TimeFilter {
    const to = endOfDay(new Date());
    const days = preset === '15d' ? 15 : preset === '30d' ? 30 : 90;

    return new TimeFilter(
      preset,
      startOfDay(subDays(to, days)),
      to,
    );
  }
}