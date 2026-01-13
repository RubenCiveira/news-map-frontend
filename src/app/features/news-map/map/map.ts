import { Component, AfterViewInit } from '@angular/core';
import * as L from 'leaflet';
import { GeoService } from '../../../core/appwrite/geo.service';

@Component({
  selector: 'news-map',
  imports: [],
  templateUrl: './map.html',
  styleUrl: './map.scss',
})
export class MapComponent implements AfterViewInit {
  private map!: L.Map;
  private readonly DEFAULT_CENTER: L.LatLngExpression = [40.4168, -3.7038]; // Madrid
  private readonly DEFAULT_ZOOM = 10;

  constructor(private geo: GeoService) {}

  async ngAfterViewInit() {
    this.map = L.map('map').setView([20, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    this.tryCenterOnBrowserLocation();
    this.getRegions();
  }

  private tryCenterOnBrowserLocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const center: L.LatLngExpression = [pos.coords.latitude, pos.coords.longitude];
        this.map.setView(center, this.DEFAULT_ZOOM, { animate: true });
      },
      // Si el usuario deniega o falla → Madrid se queda
      () => {},
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 60_000,
      }
    );
  }

  private async getRegions() {
    const regions = await this.geo.getAllRegions();

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
            .addTo(this.map)
            .bindPopup(region.title);
        } catch (fail) {
          console.error('FAIL FOR ' + region.title);
        }
      } else {
        console.log('SKIP');
      }
    }
  }
}
