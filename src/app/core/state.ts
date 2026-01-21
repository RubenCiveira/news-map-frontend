import { Injectable } from "@angular/core";
import { TimeFilter, TimeFilterService } from "./time-filter.service";
import { Observable } from "rxjs";

@Injectable({ providedIn: 'root' })
export class State {
    // public readonly timeFilter$: Observable<TimeFilter>;

    constructor(private readonly time: TimeFilterService) {
        // this.timeFilter$ = time.timeFilter$;
    }


}