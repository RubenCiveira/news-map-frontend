import { Injectable } from '@angular/core';
import { Databases, Query, TablesDB } from 'appwrite';
import { appwriteClient } from './appwrite.client';
import { combineLatest, map, Observable, startWith } from 'rxjs';

export type CatalogGroupRow = {
  $id: string;
  name: string;
  order: number;
  parentId?: string | null;
  icon?: string | null;
};

export type LayerGroupRow = {
  $id: string;
  name: string;
  order: number;
  catalogGroup?: string | null;
};

export type CatalogNode =
  | { type: 'folder'; $id: string; name: string; order: number; children: CatalogNode[] }
  | { type: 'toggle'; $id: string; name: string; order: number };

@Injectable({ providedIn: 'root' })
export class GeoService {
  private db = new Databases(appwriteClient);
  private tables = new TablesDB(appwriteClient);

  readonly databaseId = '696615f8003aca7fbb8b';
  readonly layersTable = 'layers';
  readonly layerGroupsTable = 'layergroups';
  readonly catalogGroupsTable = 'cataloggroup';
  readonly regionsTable = 'regions';
  readonly pointsTable = 'points';

  async getCatalogTree(): Promise<CatalogNode[]> {
    // 1) Primero layerGroups
    const layerGroups = await this.getLayerGroups();
    // 2) Después catalogGroups
    const catalogGroups = await this.getCatalogGroups();

    // index folders
    const foldersById = new Map<string, CatalogNode & { type: 'folder' }>();

    for (const g of catalogGroups as any as CatalogGroupRow[]) {
      foldersById.set(g.$id, {
        type: 'folder',
        $id: g.$id,
        name: g.name,
        order: g.order ?? 0,
        children: [],
      });
    }

    // folders root
    const rootFolders: (CatalogNode & { type: 'folder' })[] = [];

    // attach folders to parents
    for (const g of catalogGroups as any as CatalogGroupRow[]) {
      const folder = foldersById.get(g.$id)!;

      const parentId = g.parentId ?? null;
      if (parentId && foldersById.has(parentId)) {
        foldersById.get(parentId)!.children.push(folder);
      } else {
        rootFolders.push(folder);
      }
    }

    // attach layerGroups to folder (or root if null)
    for (const lg of layerGroups as any as LayerGroupRow[]) {
      const toggleNode: CatalogNode = {
        type: 'toggle',
        $id: lg.$id,
        name: lg.name,
        order: lg.order ?? 0,
      };

      const parentFolderId = lg.catalogGroup ?? null;
      if (parentFolderId && foldersById.has(parentFolderId)) {
        foldersById.get(parentFolderId)!.children.push(toggleNode);
      } else {
        // si no tiene catálogo, lo cuelgas de un root “Datos” o directo al root
        rootFolders.push({
          type: 'folder',
          $id: '__uncategorized__',
          name: 'Datos',
          order: 9999,
          children: [toggleNode],
        });
      }
    }

    // sort recursive
    const sortTree = (nodes: CatalogNode[]) => {
      nodes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (const n of nodes) {
        if (n.type === 'folder') sortTree(n.children);
      }
    };

    sortTree(rootFolders);
    return rootFolders;
  }

  async getCatalogGroups() {
    const res = await this.tables.listRows({
      databaseId: this.databaseId,
      tableId: this.catalogGroupsTable,
      queries: [Query.orderAsc('order')],
    });
    return res.rows;
  }

  async getLayerGroups() {
    const res = await this.tables.listRows({
      databaseId: this.databaseId,
      tableId: this.layerGroupsTable,
      queries: [Query.orderAsc('order')],
    });
    return res.rows;
  }

  async getLayers() {
    const res = await this.tables.listRows({
      databaseId: this.databaseId,
      tableId: this.layersTable,
      queries: [Query.limit(200)],
    });
    return res.rows;
  }

  getFeaturesInViewport(
    bbox: L.LatLngBounds,
    layerId: any,
    progressive?: boolean,
  ): Observable<any[]> {
    const points$ = this.getPointsInViewport(bbox, layerId, progressive).pipe(
      startWith([] as any[]),
    );

    const regions$ = this.getRegionsInViewport(bbox, layerId, progressive).pipe(
      startWith([] as any[]),
    );

    return combineLatest([points$, regions$]).pipe(
      map(([points, regions]) => ([...points, ...regions ])),
    );
  }

  getPointsInViewport(
    bbox: L.LatLngBounds,
    layerId: any,
    progressive?: boolean,
  ): Observable<any[]> {
    return new Observable((subscriber) => {
      let cancelled = false;
      let cursor: string | null = null;
      const all: any[] = [];
      const filter = [
        Query.equal('layerId', [...layerId]),
        Query.greaterThanEqual('longitude', bbox.getWest()),
        Query.lessThanEqual('longitude', bbox.getEast()),
        Query.greaterThanEqual('latitude', bbox.getSouth()),
        Query.lessThanEqual('latitude', bbox.getNorth()),
      ];

      const load = async () => {
        while (!cancelled) {
          const queries = [...filter, Query.limit(100)];
          if (cursor) queries.push(Query.cursorAfter(cursor));

          const res = await this.tables.listRows({
            databaseId: this.databaseId,
            tableId: this.pointsTable,
            queries,
          });
          if (cancelled) return;
          const values = res.rows.map((region: any) => {
            return {
              id: region.$id,
              title: region.title,
              color: region.color,
              kind: 'point',
              icon: region.icon,
              geojson: {
                type: 'Point',
                coordinates: region.geometry,
              } as any,
            };
            // this.appwritePolygonsToGeoJSON(region, (region as any).geometry)
          });
          all.push(...values);
          if (progressive) {
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

  getRegionsInViewport(
    bbox: L.LatLngBounds,
    layerId: any,
    progressive?: boolean,
  ): Observable<any[]> {
    return new Observable((subscriber) => {
      let cancelled = false;
      let cursor: string | null = null;
      const all: any[] = [];
      const filter = [
        Query.equal('layerId', [...layerId]),
        Query.greaterThanEqual('maxLng', bbox.getWest()),
        Query.lessThanEqual('minLng', bbox.getEast()),
        Query.greaterThanEqual('maxLat', bbox.getSouth()),
        Query.lessThanEqual('minLat', bbox.getNorth()),
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
            this.appwritePolygonsToGeoJSON(region, (region as any).geometry),
          );
          all.push(...values);
          if (progressive) {
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

  private appwritePolygonsToGeoJSON(region: any, polygons: any[]) {
    if (!polygons || polygons.length === 0) return null;
    if (polygons.length === 1) {
      return {
        id: region.$id,
        title: region.title,
        color: region.color,
        kind: 'region',
        geojson: {
          type: 'Polygon',
          coordinates: region.geometry,
        } as any,
      };
    }

    return {
      id: region.$id,
      title: region.title,
      color: region.color,
      kind: 'region',
      geojson: {
        type: 'MultiPolygon',
        coordinates: (region.geometry as any[]).map((polygon) => [polygon]),
      },
    };
  }
}
