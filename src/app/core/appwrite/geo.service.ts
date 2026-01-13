import { Injectable } from '@angular/core';
import { Databases, Query, TablesDB } from 'appwrite';
import { appwriteClient } from './appwrite.client';

@Injectable({ providedIn: 'root' })
export class GeoService {
  private db = new Databases(appwriteClient);
  private tables = new TablesDB(appwriteClient);

  readonly databaseId = '696615f8003aca7fbb8b';
  readonly layersTable = 'layers';
  readonly regionsTable = 'regions';

  async getLayers() {
    const res = await this.tables.listRows({
      databaseId: this.databaseId,
      tableId: this.layersTable,
    });
    return res.rows;
  }

  async getAllRegions() {
    let all: any[] = [];
    let cursor: string | null = null;
    while (true) {
      const queries = [Query.limit(100)];
      if (cursor) {
        queries.push(Query.cursorAfter(cursor));
      }
      const res = await this.tables.listRows({
        databaseId: this.databaseId,
        tableId: this.regionsTable,
        queries: queries,
      });
      const values = res.rows.map((region) =>
        this.appwritePolygonsToGeoJSON(region, (region as any).geometry)
      );
      all.push(...values);
      if (res.rows.length < 100) {
        break;
      }
      cursor = res.rows[res.rows.length - 1].$id;
    }
    return all;
  }

  private appwritePolygonsToGeoJSON(region: any, polygons: any[]) {
    if (!polygons || polygons.length === 0) return null;
    if (polygons.length === 1) {
      return {
        title: region.title,
        color: region.color,
        geojson: {
          type: 'Polygon',
          coordinates: region.geometry,
        } as any,
      };
    }

    return {
      title: region.title,
      color: region.color,
      geojson: {
        type: 'MultiPolygon',
        coordinates: (region.geometry as any[]).map(polygon => [polygon]),
      },
    };
  }
}
