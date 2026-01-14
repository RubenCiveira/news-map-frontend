import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import * as L from 'leaflet';
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

class ViewPort {
  constructor(public readonly bounds: L.LatLngBounds, public readonly layers: Set<string>) {}

  equals(view: ViewPort) {
    const eq = this.bounds.equals(view.bounds) && this.setEquals(this.layers, view.layers);
    console.log('EQUALS ', eq);
    return eq;
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

  // private regionsLayer = L.layerGroup();
  private regionsLayer: any = {};
  private allLayers: any = {};

  private selectedLayerIds = new Set<string>();

  private viewport$ = new Subject<ViewPort>(); // new Subject<L.LatLngBounds>();

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
                const layer = layerInfo.$id;
                if (this.isLayerEnabled(layerInfo, this.map.getZoom())) {
                  allLayersToView.add(layerInfo.$id);
                }
              });
            }
          });
          Object.keys(this.regionsLayer).forEach((prev) => {
            if (!allLayersToView.has(prev)) {
              this.regionsLayer[prev].remove();
              delete this.regionsLayer[prev];
            }
          });
          allLayersToView.forEach((layer) => {
            const previous = !!this.regionsLayer[layer];
            const call = this.geo.getRegionsInViewport(bbox.bounds, layer, !previous).pipe(
              catchError((err) => EMPTY),
              tap((regions) => {
                if (this.regionsLayer[layer]) {
                  this.regionsLayer[layer].remove();
                }
                this.regionsLayer[layer] = L.layerGroup();
                this.regionsLayer[layer].addTo(this.map);
                this.renderRegions(regions, this.regionsLayer[layer]);
              })
            );
            values.push(call);
          });
          return merge(...values);
        })
      )
      .subscribe();
    this.reloadRegions();
    this.map.on('moveend zoomend', () => {
      this.reloadRegions();
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
        }
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
      dynamicLayersProvider: async () => {
        const layers = await this.geo.getLayerGroups();
        return layers.map((l: any) => l);
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
          })
            .addTo(layer)
            .bindPopup(region.title);
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
}
