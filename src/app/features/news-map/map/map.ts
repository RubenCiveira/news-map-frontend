import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { GeoService } from '../../../core/geo.service';
import {
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  Observable,
  shareReplay,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { createLayersButtonControl } from './layers-button.control';
import { TemplateService } from './template.service';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { inject } from '@angular/core';
import { DetailSheetComponent } from './detail-sheet.component';
import { PickablePoint, PickablePolygon, MapStore } from './map.store';
import { ViewPort } from './view-port';
import { TimeFilterService } from '../../../core/time-filter.service';

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

  private bottomSheet = inject(MatBottomSheet);

  private map!: L.Map;
  private regionStore!: MapStore;
  private eventStore!: MapStore;

  private allLayers: any = {};

  private templateRender = new TemplateService();

  private viewport$ = new Subject<ViewPort>();
  private selectedLayerIds = new Set<string>();

  constructor(
    private readonly geo: GeoService,
    private readonly time: TimeFilterService,
  ) {
    // time.timeFilter$
  }

  async ngAfterViewInit() {
    this.map = L.map('map').setView([20, 0], 2);
    this.regionStore = new MapStore(this.map);
    this.eventStore = new MapStore(this.map);

    osm.addTo(this.map);
    this.attachLayerSelector();
    this.tryCenterOnBrowserLocation();

    combineLatest([this.viewport$, this.time.timeFilter$])
      .pipe(
        debounceTime(200),
        distinctUntilChanged((a, b) => a[0].equals(b[0]) && a[1].equals(b[1])),
        switchMap(([bbox, time]) =>
          this.geo
            .getEventsInViewportDuringTime(bbox.bounds, time, this.currentLayers(), false)
            .pipe(
              tap((reg) => {
                console.log('IN MID', reg);
              }),
            ),
        ),
        shareReplay({ bufferSize: 1, refCount: true }),
      )
      .subscribe((events) => this.renderEvents(events));

    this.viewport$
      .pipe(
        debounceTime(200), // evita floods
        distinctUntilChanged((a, b) => a.equals(b)),
        switchMap((bbox) =>
          this.geo.getFeaturesInViewport(
            bbox.bounds,
            this.currentLayers(),
            !this.regionStore.hasContent(),
          ),
        ),
        shareReplay({ bufferSize: 1, refCount: true }),
      )
      .subscribe((regions) => this.renderRegions(regions));
    this.reloadRegions();
    this.map.on('moveend zoomend', () => this.reloadRegions());
    this.map.on('click', (e) => this.onClick(e));
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

  private onClick(e: L.LeafletMouseEvent) {
    const picks = this.regionStore.near(e.latlng);
    const total = picks.length;
    if (total === 1) {
      this.openPolygonDetail(picks[0], e.latlng);
    } else if (total > 0) {
      this.openPickListPopup(picks, e.latlng);
    }
  }

  private currentLayers(): string[] {
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
    return [...allLayersToView];
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

  private getLayer(id: string) {
    let result = undefined;
    Object.values(this.allLayers).forEach((value: any) => {
      value.forEach((layer: any) => {
        if (layer.$id === id) {
          result = layer;
        }
      });
    });
    return result;
  }

  private renderEvents(events: any[]) {
    const currentLayers = this.currentLayers();
    for (const el of this.eventStore.elements()) {
      if (!currentLayers.includes(el.content.layerId)) {
        this.eventStore.remove(el);
      }
    }
    for (const event of events) {
      const mapLayer = this.getLayer(event.layerId);
      const angulo = event.heading ?? 0;
      const iconoPersonalizado = L.divIcon({
        className: '',
        html: `
        <img src="img/plane.png"
             style="width:40px;height:40px; transform: rotate(${angulo}deg);">
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      const mark = L.marker([event.latitude, event.longitude], { icon: iconoPersonalizado });
      const pick = this.eventStore.addPoint(event, mapLayer, mark);
      mark.on('click', (e) => this.openPolygonDetail(pick, new L.LatLng(event.latitude,event.longitude)));
    }
  }

  private renderRegions(regions: any[]) {
    const currentLayers = this.currentLayers();
    for (const el of this.regionStore.elements()) {
      if (!currentLayers.includes(el.content.layerId)) {
        this.regionStore.remove(el);
      }
    }
    for (const region of regions) {
      try {
        const mapLayer = this.getLayer(region.layerId);
        if (region.kind == 'point') {
          // diámetro aproximado en px (o radio, según tu implementación)
          const iconElement = this.svgIcon(region);
          if (iconElement) {
            this.regionStore.addPoligon(region, mapLayer, iconElement);
          } else {
            this.regionStore.addPointToCluster(
              region,
              mapLayer,
              L.geoJSON(region.geojson, {
                style: {
                  weight: 1,
                },
              }),
            );
          }
        } else {
          this.regionStore.addPoligon(
            region,
            mapLayer,
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

    const hasMore = !!item.content?.bigTemplate;

    let content;
    if (item.content.smallTemplate) {
      const html = this.templateRender.render({
        template: item.content.smallTemplate,
        mode: 'markdown',
        data: item.content.metadata,
      });
      content = `<div class="popup-md">${html}
              ${
                hasMore
                  ? `
          <div style="margin-top:10px; display:flex; justify-content:flex-end">
            <button class="btn-more-detail" type="button"
              style="border:0; background:#1976d2; color:white; padding:6px 10px; border-radius:8px; cursor:pointer">
              Más detalle
            </button>
          </div>
        `
                  : ``
              }
        </div>`;
    } else {
      content = `<div>
            <b>${escapeHtml(item.title)}</b><br/>ID: ${item.id}
              ${hasMore ? `<div style="margin-top:10px"><button class="btn-more-detail" type="button">Más detalle</button></div>` : ``}
              </div>`;
    }

    const popup = L.popup().setLatLng(latlng).setContent(content).openOn(this.map);
    popup.on('remove', () => {
      (item.leafletLayer as any).setStyle?.(prev);
    });
    // enganchar botón "más detalle"
    if (hasMore) {
      setTimeout(() => {
        const el = popup.getElement();
        if (!el) return;

        const btn = el.querySelector('.btn-more-detail') as HTMLButtonElement | null;
        if (!btn) return;

        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();

          const html = this.templateRender.render({
            template: item.content.bigTemplate,
            mode: 'markdown',
            data: item.content.metadata,
          });
          popup.close();
          this.bottomSheet.open(DetailSheetComponent, {
            data: { html },
            panelClass: 'detail-sheet-panel',
          });
        });
      }, 0);
    }
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

function svgPathStringToPoints(svgText: string, samples = 64): XY[] {
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
