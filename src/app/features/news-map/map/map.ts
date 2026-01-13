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

  constructor(private geo: GeoService) {}

  async ngAfterViewInit() {
    this.map = L.map('map').setView([20, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);

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
          console.error('FAIL FOR ' + region.title );
        }
      } else {
        console.log('SKIP');
      }
    }
  }
}
