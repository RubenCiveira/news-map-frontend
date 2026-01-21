import * as L from 'leaflet';
import booleanIntersects from '@turf/boolean-intersects';

export type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

export type PickablePoint = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  content: any;
  leafletLayer: L.Layer; // para resaltar luego
};

export type PickablePolygon = {
  id: string;
  title: string;
  layerId?: string;
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  bbox?: BBox; // si lo tienes (ideal)
  content: any;
  leafletLayer: L.Layer; // para resaltar luego
};

export class MapStore {
  private clusterLayer?: any;
  private regionsLayer?: L.LayerGroup<any>;
  private polygonById = new Map<string, L.Layer>();
  private pickables = new Map<string, PickablePolygon>();
  private pickablesPoints = new Map<string, PickablePoint>();

  constructor(private readonly map: L.Map) {}

  public hasContent(): boolean {
    return !!this.regionsLayer;
  }

  public poligons(): Map<string, L.Layer> {
    return this.polygonById;
  }

  public hasPoligon(id: string): boolean {
    return this.polygonById.has(id);
  }

  public getPoligon(id: string): L.Layer | undefined {
    return this.polygonById.get(id);
  }

  public remove(element: PickablePoint | PickablePolygon) {
    const id = element.id;
    if( this.pickables.has(id) ) {
      const el = this.pickables.get(id)!;
      el.leafletLayer.remove();
      this.pickables.delete(id);
    }
    if( this.pickablesPoints.has(id) ) {
      const el = this.pickablesPoints.get(id)!;
      el.leafletLayer.remove();
      this.pickablesPoints.delete(id);
    }
  }
  
  public elements(): (PickablePoint | PickablePolygon)[] {
    return [...this.pickables.values(), ...this.pickablesPoints.values()];
  }

  public near(p: L.LatLng): (PickablePoint | PickablePolygon)[] {
    const radiusMeters = metersFromPixels(this.map, 18, p);
    const nearbyPoints = pickNearbyPoints(this.pickablesPoints, p, radiusMeters);
    const pickBounds = bboxAroundLatLng(this.map, p, 18);
    const nearbyPolygons = pickNearbyPolygons(this.pickables, pickBounds);
    return [...nearbyPoints, ...nearbyPolygons];
  }

  public addPoint(region: any, layer: any, element: L.Layer): PickablePoint {
    if( this.pickablesPoints.has( region.id ) ) {
      return this.pickablesPoints.get(region.id)!;
    }
    if (!this.regionsLayer) {
      this.regionsLayer = L.layerGroup();
      this.regionsLayer.addTo(this.map);
    }
    this.polygonById.set(region.id, element);
    this.regionsLayer.addLayer(element);
    const pick = {
      id: region.id,
      title: region.title,
      lat: region.geojson.coordinates[1],
      lng: region.geojson.coordinates[0],
        content: { ...region,
          smallTemplate: layer?.smallTemplate,
          bigTemplate: layer?.bigTemplate
        },
      leafletLayer: element,
    };
    this.pickablesPoints.set(region.id, pick);
    return pick;
  }

  public addPointToCluster(region: any, layer: any, element: L.Layer): PickablePoint {
    if( this.pickablesPoints.has( region.id ) ) {
      return this.pickablesPoints.get(region.id)!;
    }
    if (!this.clusterLayer) {
      this.clusterLayer = L.layerGroup();
      this.clusterLayer.addTo(this.map);
    }
    this.polygonById.set(region.id, element);
    this.clusterLayer.addLayer(element);
    const pick = {
      id: region.id,
      title: region.title,
      lat: region.geojson.coordinates[1],
      lng: region.geojson.coordinates[0],
        content: { ...region,
          smallTemplate: layer?.smallTemplate,
          bigTemplate: layer?.bigTemplate
        },
      leafletLayer: element,
    };
    this.pickablesPoints.set(region.id, pick);
    return pick;
  }

  public addPoligon(region: any, layer: any, element: L.Layer): PickablePoint|PickablePolygon {
    if( this.pickablesPoints.has( region.id ) ) {
      return this.pickablesPoints.get(region.id)!;
    }
    if( this.pickablesPoints.has( region.id ) ) {
      return this.pickablesPoints.get(region.id)!;
    }
    if (!this.regionsLayer) {
      this.regionsLayer = L.layerGroup();
      this.regionsLayer.addTo(this.map);
    }
    this.polygonById.get(region.id)?.remove();
    this.polygonById.set(region.id, element);
    this.regionsLayer.addLayer(element);
    if (region.kind == 'point') {
      const pick = {
        id: region.id,
        title: region.title,
        lat: region.geojson.coordinates[1],
        lng: region.geojson.coordinates[0],
        content: { ...region,
          smallTemplate: layer?.smallTemplate,
          bigTemplate: layer?.bigTemplate
        },
        leafletLayer: element,
      };
      this.pickablesPoints.set(region.id, pick);
      return pick;
    } else {
      const pick = {
        id: region.id,
        title: region.title,
        feature: region.geojson,
        content: { ...region,
          smallTemplate: layer?.smallTemplate,
          bigTemplate: layer?.bigTemplate
        },
        leafletLayer: element,
      };
      this.pickables.set(region.id, pick);
      return pick;
    }
  }
}

function metersFromPixels(map: L.Map, px: number, at: L.LatLng): number {
  const p = map.latLngToContainerPoint(at);
  const p2 = L.point(p.x + px, p.y);
  const latlng2 = map.containerPointToLatLng(p2);
  return at.distanceTo(latlng2); // metros
}

function bboxAroundLatLng(map: L.Map, at: L.LatLng, radiusPx: number): L.LatLngBounds {
  const p = map.latLngToContainerPoint(at);
  const p1 = L.point(p.x - radiusPx, p.y - radiusPx);
  const p2 = L.point(p.x + radiusPx, p.y + radiusPx);

  const ll1 = map.containerPointToLatLng(p1);
  const ll2 = map.containerPointToLatLng(p2);

  return L.latLngBounds(ll1, ll2);
}

function pickNearbyPoints(
  points: Map<string, PickablePoint>,
  center: L.LatLng,
  radiusMeters: number,
) {
  return Array.from(points.values())
    .map((p) => {
      const d = center.distanceTo(L.latLng(p.lat, p.lng));
      return { ...p, distance: d };
    })
    .filter((p) => p.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance);
}

function pickNearbyPolygons(
  polygons: Map<string, PickablePolygon>,
  pickBounds: L.LatLngBounds,
  opts?: { maxResults?: number },
): PickablePolygon[] {
  const maxResults = opts?.maxResults ?? 50;

  const pickBBox = boundsToBBox(pickBounds);
  const pickPoly = bboxToPolygon(
    pickBBox.minLng,
    pickBBox.minLat,
    pickBBox.maxLng,
    pickBBox.maxLat,
  );

  const hits: { poly: PickablePolygon; score: number }[] = [];

  for (const p of polygons.values()) {
    // 1) Prefiltro rápido por bbox si existe
    if (p.bbox && !bboxIntersects(p.bbox, pickBBox)) continue;

    // 2) Precisión: intersección real con el área de pick
    try {
      const ok = booleanIntersects(pickPoly as any, p.feature as any);
      if (!ok) continue;

      // score para ordenar: bbox más pequeña = más “específica”
      const score = p.bbox ? bboxAreaApprox(p.bbox) : Number.POSITIVE_INFINITY;
      hits.push({ poly: p, score });
    } catch {
      // Si el GeoJSON está mal, lo ignoramos en el picking
      continue;
    }
  }

  hits.sort((a, b) => a.score - b.score);

  return hits.slice(0, maxResults).map((x) => x.poly);
}

function boundsToBBox(b: L.LatLngBounds): BBox {
  return {
    minLng: b.getWest(),
    minLat: b.getSouth(),
    maxLng: b.getEast(),
    maxLat: b.getNorth(),
  };
}

function bboxIntersects(a: BBox, b: BBox): boolean {
  return (
    a.minLng <= b.maxLng && a.maxLng >= b.minLng && a.minLat <= b.maxLat && a.maxLat >= b.minLat
  );
}

function bboxAreaApprox(b: BBox): number {
  // área aproximada en "grados cuadrados" (vale para ordenar)
  return Math.abs((b.maxLng - b.minLng) * (b.maxLat - b.minLat));
}

function bboxToPolygon(minLng: number, minLat: number, maxLng: number, maxLat: number) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat], // cerrar el anillo
        ],
      ],
    },
  } as const;
}
