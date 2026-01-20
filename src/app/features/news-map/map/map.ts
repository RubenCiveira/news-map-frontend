import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import * as L from 'leaflet';
import booleanIntersects from '@turf/boolean-intersects';
import 'leaflet.markercluster';
import { GeoService } from '../../../core/appwrite/geo.service';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  merge,
  Observable,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { createLayersButtonControl } from './layers-button.control';

type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

type PickablePoint = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  leafletLayer: L.Layer; // para resaltar luego
};

type PickablePolygon = {
  id: string;
  title: string;
  layerId?: string;
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  bbox?: BBox; // si lo tienes (ideal)
  leafletLayer: L.Layer; // para resaltar luego
};

class ViewPort {
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

class RegionStore {
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

  public near(p: L.LatLng): (PickablePoint | PickablePolygon)[] {
    const radiusMeters = metersFromPixels(this.map, 18, p);
    const nearbyPoints = pickNearbyPoints(this.pickablesPoints, p, radiusMeters);
    const pickBounds = bboxAroundLatLng(this.map, p, 18);
    const nearbyPolygons = pickNearbyPolygons(this.pickables, pickBounds);
    return [...nearbyPoints, ...nearbyPolygons];
  }

  public addPoint(region: any, element: L.GeoJSON) {
    this.polygonById.set(region.id, element);
    if (!this.clusterLayer) {
      this.clusterLayer = L.layerGroup();
      this.clusterLayer.addTo(this.map);
    }
    this.clusterLayer.addLayer(element);
    this.pickablesPoints.set(region.id, {
      id: region.id,
      title: region.title,
      lat: region.geojson.coordinates[1],
      lng: region.geojson.coordinates[0],
      leafletLayer: element,
    });
  }

  public addPoligon(region: any, element: L.GeoJSON) {
    if (!this.regionsLayer) {
      this.regionsLayer = L.layerGroup();
      this.regionsLayer.addTo(this.map);
    }
    this.polygonById.get(region.id)?.remove();
    this.polygonById.set(region.id, element);
    this.regionsLayer.addLayer(element);
    if (region.kind == 'point') {
      this.pickablesPoints.set(region.id, {
        id: region.id,
        title: region.title,
        lat: region.geojson.coordinates[1],
        lng: region.geojson.coordinates[0],
        leafletLayer: element,
      });
    } else {
      this.pickables.set(region.id, {
        id: region.id,
        title: region.title,
        feature: region.geojson,
        leafletLayer: element,
      });
    }
  }
}

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
const satellite = L.tileLayer('https://{s}.sat.tiles/{z}/{x}/{y}.jpg');

@Component({
  selector: 'news-map',
  imports: [],
  templateUrl: './map.html',
  styleUrl: './map.scss',
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private readonly ICON_SIZE = 24;
  private readonly DEFAULT_ZOOM = 6;
  private readonly DEFAULT_CENTER: L.LatLngExpression = [40.4168, -3.7038]; // Madrid

  private map!: L.Map;
  private store!: RegionStore;

  private allLayers: any = {};

  private viewport$ = new Subject<ViewPort>();
  private selectedLayerIds = new Set<string>();

  constructor(private geo: GeoService) {}

  async ngAfterViewInit() {
    this.map = L.map('map').setView([20, 0], 2);
    this.store = new RegionStore(this.map);

    osm.addTo(this.map);
    this.attachLayerSelector();
    this.tryCenterOnBrowserLocation();

    this.viewport$
      .pipe(
        debounceTime(150), // evita floods
        distinctUntilChanged((a, b) => a.equals(b)),
        switchMap((bbox) => {
          const values: Observable<any>[] = [];
          const allLayersToView = new Set<string>();
          this.selectedLayerIds.forEach((groups) => {
            if (this.allLayers[groups]) {
              this.allLayers[groups].forEach((layerInfo: any) => {
                if (this.isLayerEnabled(layerInfo, this.map.getZoom())) {
                  allLayersToView.add(layerInfo.$id);
                }
              });
            }
          });
          const previous = this.store.hasContent();
          if (allLayersToView.size > 0) {
            const call = this.geo
              .getFeaturesInViewport(bbox.bounds, allLayersToView, !previous)
              .pipe(
                catchError((err) => EMPTY),
                tap((regions) => {
                  this.renderRegions(regions);
                }),
              );
            values.push(call);
          }
          return merge(...values);
        }),
      )
      .subscribe();
    this.reloadRegions();
    this.map.on('moveend zoomend', () => {
      this.reloadRegions();
    });
    this.map.on('click', (e) => {
      const picks = this.store.near(e.latlng);
      const total = picks.length;
      if (total === 1) {
        this.openPolygonDetail(picks[0], e.latlng);
      } else if (total > 0) {
        this.openPickListPopup(picks, e.latlng);
      }
    });
    const layers = await this.geo.getLayers();
    layers.forEach((layer) => {
      const group = (layer as any).layerGroup;
      if (!this.allLayers[group]) {
        this.allLayers[group] = [];
      }
      this.allLayers[group].push(layer);
    });
  }

  ngOnDestroy(): void {
    this.viewport$.unsubscribe();
  }

  private currentView() {
    return new ViewPort(this.map.getBounds(), this.selectedLayerIds);
  }

  private reloadRegions() {
    this.viewport$.next(this.currentView());
  }

  private tryCenterOnBrowserLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const center: L.LatLngExpression = [pos.coords.latitude, pos.coords.longitude];
          this.map.setView(center, this.DEFAULT_ZOOM, { animate: true });
        },
        // Si el usuario deniega o falla → Madrid se queda
        () => {
          this.map.setView(this.DEFAULT_CENTER, this.DEFAULT_ZOOM, { animate: false });
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 60_000,
        },
      );
    } else {
      this.map.setView(this.DEFAULT_CENTER, this.DEFAULT_ZOOM, { animate: false });
    }
  }

  private attachLayerSelector() {
    const control = createLayersButtonControl({
      baseLayers: [
        { id: 'osm', name: 'Mapa base', type: 'base', layer: osm },
        { id: 'sat', name: 'Satélite', type: 'base', layer: satellite },
      ],
      overlays: [],
      dynamicTreeProvider: async () => {
        return this.geo.getCatalogTree();
      },
      onDynamicChange: (ids) => {
        this.selectedLayerIds = ids;
        this.reloadRegions();
      },
    });
    control.addTo(this.map);
  }

  private renderRegions(regions: any[]) {
    // const currents = regions.map((r) => r.id);
    // for (const [id, layer] of this.store.poligons()) {
    //   if (!currents.includes(id)) {
    //     // console.log('delete');
    //   }
    // }
    for (const region of regions) {
      if (region) {
        try {
          if (region.kind == 'point') {
            // diámetro aproximado en px (o radio, según tu implementación)
            const iconElement = this.svgIcon(region);
            if (iconElement) {
              this.store.addPoligon(region, iconElement);
            } else {
              this.store.addPoint(
                region,
                L.geoJSON(region.geojson, {
                  style: {
                    weight: 1,
                  },
                }),
              );
            }
          } else {
            this.store.addPoligon(
              region,
              L.geoJSON(region.geojson, {
                style: {
                  color: region.color,
                  fillOpacity: 0.2,
                  weight: 1,
                },
              }),
            );
          }
        } catch (fail) {
          console.error('FAIL FOR ' + region.title);
        }
      } else {
        console.log('SKIP');
      }
    }
  }

  private svgIcon(region: any): L.GeoJSON | undefined {
    const svgPoints = svgPathStringToPoints(region.icon);
    const center = L.latLng(region.geojson.coordinates[1], region.geojson.coordinates[0]);
    const sizeMeters = metersFromPixels(this.map, this.ICON_SIZE, center);
    const polyLatLngs = svgPointsToGeoPolygon(center, svgPoints, sizeMeters); // 200m de tamaño
    if (polyLatLngs) {
      return L.geoJSON(
        {
          type: 'Polygon',
          coordinates: [polyLatLngs.map((pair) => [pair.lng, pair.lat])],
        } as any,
        {
          style: {
            color: region.color,
            fillOpacity: 0.2,
            weight: 1,
          },
        },
      );
    } else {
      return undefined;
    }
  }

  private isLayerEnabled(layer: any, zoom: number) {
    if (layer.zoomMin != undefined && zoom < layer.zoomMin) return false;
    if (layer.zoomMax != undefined && zoom > layer.zoomMax) return false;
    return true;
  }

  private openPickListPopup(hits: (PickablePoint | PickablePolygon)[], latlng: L.LatLng) {
    const html = `
    <div style="max-height:220px; overflow:auto; min-width:220px">
      <div style="font-weight:600; margin-bottom:8px">
        ${hits.length} elementos aquí
      </div>
      ${hits
        .map(
          (h) => `
        <button data-id="${h.id}"
          style="display:block;width:100%;text-align:left;padding:6px 8px;margin:4px 0;cursor:pointer">
          ${escapeHtml(h.title)}
        </button>
      `,
        )
        .join('')}
    </div>
  `;

    const popup = L.popup().setLatLng(latlng).setContent(html).openOn(this.map);

    // Hook: capturar clicks en los botones del popup
    setTimeout(() => {
      const container = popup.getElement();
      if (!container) return;

      container.querySelectorAll('button[data-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = (btn as HTMLButtonElement).dataset['id'];
          const sel = hits.find((x) => x.id === id);
          if (sel) this.openPolygonDetail(sel, latlng);
        });
      });
    }, 0);
  }

  private openPolygonDetail(item: PickablePoint | PickablePolygon, latlng: L.LatLng) {
    // resaltar
    const prev = { ...(item.leafletLayer as any).options?.style };
    (item.leafletLayer as any).setStyle?.({ weight: 4, fillOpacity: 0.35 });

    const popup = L.popup()
      .setLatLng(latlng)
      .setContent(`<b>${escapeHtml(item.title)}</b><br/>ID: ${item.id}`)
      .openOn(this.map);
    popup.on('remove', () => {
      (item.leafletLayer as any).setStyle?.(prev);
    });
  }
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[c] as string,
  );
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

function offsetMetersToLatLng(center: L.LatLng, dxMeters: number, dyMeters: number): L.LatLng {
  const R = 6378137; // metros
  const dLat = (dyMeters / R) * (180 / Math.PI);
  const dLng = (dxMeters / (R * Math.cos((center.lat * Math.PI) / 180))) * (180 / Math.PI);
  return L.latLng(center.lat + dLat, center.lng + dLng);
}

type XY = { x: number; y: number };

/**
 * Convierte puntos (x,y) de un SVG (en unidades del viewBox) a un polígono Geo
 * centrado en `center`, con tamaño `sizeMeters` (diámetro aprox).
 */
function svgPointsToGeoPolygon(center: L.LatLng, points: XY[], sizeMeters: number) {
  if (points.length < 3) return null;

  // 1) normalizar para que encaje en [-1..1] aprox
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const width = Math.max(1e-9, maxX - minX);
  const height = Math.max(1e-9, maxY - minY);

  // escala para que el mayor lado mida sizeMeters
  const scale = sizeMeters / Math.max(width, height);

  // 2) pasar a latlng (cerrando el polígono)
  const latlngs: L.LatLng[] = points.map((p) => {
    const xCentered = p.x - (minX + width / 2);
    const yCentered = p.y - (minY + height / 2);

    // ojo: SVG Y positivo hacia abajo, lo invertimos para "Norte"
    const dx = xCentered * scale;
    const dy = -yCentered * scale;

    return offsetMetersToLatLng(center, dx, dy);
  });

  // cerrar
  latlngs.push(latlngs[0]);

  return latlngs;
}

export function svgPathStringToPoints(svgText: string, samples = 64): XY[] {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const path = doc.querySelector('path');
  if (!path) return [];

  // Necesitamos que exista como elemento SVG real para usar getTotalLength()
  // Creamos un <svg> temporal oculto
  const tmpSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tmpSvg.setAttribute(
    'style',
    'position:absolute; left:-99999px; top:-99999px; width:0; height:0;',
  );

  // Importamos el path al documento real
  const imported = document.importNode(path, true) as SVGPathElement;
  tmpSvg.appendChild(imported);
  document.body.appendChild(tmpSvg);

  try {
    const len = imported.getTotalLength();
    if (!isFinite(len) || len <= 0) return [];

    const pts: XY[] = [];
    for (let i = 0; i < samples; i++) {
      const t = i / samples;
      const p = imported.getPointAtLength(t * len);
      pts.push({ x: p.x, y: p.y });
    }
    return pts;
  } finally {
    tmpSvg.remove();
  }
}
