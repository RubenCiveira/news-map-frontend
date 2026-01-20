import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import * as L from 'leaflet';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';

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

type PickablePolygon = {
  id: string;
  title: string;
  layerId?: string;
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
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

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
const satellite = L.tileLayer('https://{s}.sat.tiles/{z}/{x}/{y}.jpg');

@Component({
  selector: 'news-map',
  imports: [],
  templateUrl: './map.html',
  styleUrl: './map.scss',
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private map!: L.Map;

  private readonly DEFAULT_CENTER: L.LatLngExpression = [40.4168, -3.7038]; // Madrid
  private readonly DEFAULT_ZOOM = 6;

  private pickables: PickablePolygon[] = [];

  private allLayers: any = {};
  private regionsLayer?: L.LayerGroup<any>;

  private viewport$ = new Subject<ViewPort>();
  private selectedLayerIds = new Set<string>();

  constructor(private geo: GeoService) {}

  async ngAfterViewInit() {
    this.map = L.map('map').setView([20, 0], 2);

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
          const previous = !!this.regionsLayer;
          if (allLayersToView.size > 0) {
            const call = this.geo
              .getRegionsInViewport(bbox.bounds, allLayersToView, !previous)
              .pipe(
                catchError((err) => EMPTY),
                tap((regions) => {
                  if (this.regionsLayer) {
                    this.regionsLayer.remove();
                  }
                  this.regionsLayer = L.layerGroup();
                  this.regionsLayer.addTo(this.map);
                  this.pickables = [];
                  this.renderRegions(regions, this.regionsLayer);
                }),
              );
            values.push(call);
          } else if (this.regionsLayer) {
            this.regionsLayer.remove();
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
      const p = point([e.latlng.lng, e.latlng.lat]);
      console.log("ON", p);
      const hits = this.pickables.filter((item) => booleanPointInPolygon(p, item.feature as any));

      if (hits.length === 0) return;

      if (hits.length === 1) {
        this.openPolygonDetail(hits[0], e.latlng);
        return;
      }

      this.openPickListPopup(hits, e.latlng);
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
      overlays: [], // si quieres capas Leaflet locales
      dynamicTreeProvider: async () => {
        return this.geo.getCatalogTree();
        // const layers = await this.geo.getLayerGroups();
        // return layers.map((l: any) => l);
      },
      onDynamicChange: (ids) => {
        console.log('Use ', ids);
        this.selectedLayerIds = ids;
        this.reloadRegions();
      },
    });

    control.addTo(this.map);
  }

  private renderRegions(regions: any[], layer: L.LayerGroup<any>) {
    for (const region of regions) {
      if (region) {
        try {
          L.geoJSON(region.geojson, {
            style: {
              color: region.color,
              fillOpacity: 0.2,
              weight: 1,
            },
          }).addTo(layer);
          this.pickables.push({
            id: region.id,
            title: region.title,
            feature: region.geojson,
            leafletLayer: layer,
          });
        } catch (fail) {
          console.error('FAIL FOR ' + region.title);
        }
      } else {
        console.log('SKIP');
      }
    }
  }

  private isLayerEnabled(layer: any, zoom: number) {
    if (layer.zoomMin != undefined && zoom < layer.zoomMin) return false;
    if (layer.zoomMax != undefined && zoom > layer.zoomMax) return false;
    return true;
  }

  private openPickListPopup(hits: PickablePolygon[], latlng: L.LatLng) {
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

  private openPolygonDetail(item: PickablePolygon, latlng: L.LatLng) {
    // resaltar
    (item.leafletLayer as any).setStyle?.({ weight: 4, fillOpacity: 0.35 });

    L.popup()
      .setLatLng(latlng)
      .setContent(`<b>${escapeHtml(item.title)}</b><br/>ID: ${item.id}`)
      .openOn(this.map);
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
