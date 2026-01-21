import * as L from 'leaflet';

export class ViewPort {
  constructor(
    public readonly bounds: L.LatLngBounds,
    public readonly layers: Set<string>,
  ) {}

  equals(view: ViewPort) {
    return this.bounds.equals(view.bounds) && this.setEquals(this.layers, view.layers);
  }

  setEquals(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }
}
