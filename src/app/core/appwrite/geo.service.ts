import { Injectable } from '@angular/core';
import { Databases, Query, TablesDB } from 'appwrite';
import { appwriteClient } from './appwrite.client';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GeoService {
  private db = new Databases(appwriteClient);
  private tables = new TablesDB(appwriteClient);

  readonly databaseId = '696615f8003aca7fbb8b';
  readonly layersTable = 'layers';
  readonly layerGroupsTable = 'layerGroups';
  readonly regionsTable = 'regions';

  async getLayerGroups() {
    const res = await this.tables.listRows({
      databaseId: this.databaseId,
      tableId: this.layerGroupsTable,
    });
    return res.rows;
  }

  async getLayers() {
    const res = await this.tables.listRows({
      databaseId: this.databaseId,
      tableId: this.layersTable,
    });
    return res.rows;
  }

  getRegionsInViewport(bbox: L.LatLngBounds, layerId: string, progressive?: boolean): Observable<any[]> {
    return new Observable((subscriber) => {
      let cancelled = false;
      let cursor: string | null = null;
      const all: any[] = [];

      const filter = [
        Query.equal('layerId', layerId),
        Query.greaterThanEqual('maxLng', Math.floor( bbox.getWest() ) -1 ),
        Query.lessThanEqual('minLng', Math.ceil( bbox.getEast() ) + 1),
        Query.greaterThanEqual('maxLat', Math.floor( bbox.getSouth() ) - 1),
        Query.lessThanEqual('minLat', Math.ceil( bbox.getNorth() ) + 1),
      ];

      const load = async () => {
        while (!cancelled) {
          const queries = [...filter, Query.limit(100)];
          if (cursor) queries.push(Query.cursorAfter(cursor));

          const res = await this.tables.listRows({
            databaseId: this.databaseId,
            tableId: this.regionsTable,
            queries,
          });
          if (cancelled) return;
          const values = res.rows.map((region) =>
            this.appwritePolygonsToGeoJSON(region, (region as any).geometry)
          );
          all.push(...values);
          if( progressive ) {
            subscriber.next(all);
          }
          if (res.rows.length < 100) break;
          cursor = res.rows[res.rows.length - 1].$id;
        }
        if (!progressive) {
          subscriber.next(all);
        }
        subscriber.complete();
      };

      load().catch((err) => subscriber.error(err));

      return () => {
        cancelled = true;
      };
    });
  }

  async oldGetRegionsInViewport(bbox: L.LatLngBounds) {
    let all: any[] = [];
    let cursor: string | null = null;
    let filter = [
      Query.greaterThanEqual('maxLng', bbox.getWest()),
      Query.lessThanEqual('minLng', bbox.getEast()),
      Query.greaterThanEqual('maxLat', bbox.getSouth()),
      Query.lessThanEqual('minLat', bbox.getNorth()),
    ];
    while (true) {
      const queries = [...filter, Query.limit(100)];
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
        coordinates: (region.geometry as any[]).map((polygon) => [polygon]),
      },
    };
  }
}
