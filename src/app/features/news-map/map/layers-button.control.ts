import * as L from 'leaflet';
import { CatalogNode } from '../../../core/geo.service';

export type FixedLayer = {
  id: string;
  name: string;
  type: 'base' | 'overlay';
  layer: L.Layer;
};

export function createLayersButtonControl(opts: {
  position?: L.ControlPosition;
  baseLayers: FixedLayer[];
  overlays: FixedLayer[];
  dynamicTreeProvider: () => Promise<CatalogNode[]>;
  onDynamicChange: (selectedIds: Set<string>) => void;
}) {
  const position = opts.position ?? 'topright';

  const Control = L.Control.extend({
    onAdd(map: L.Map) {
      const container = L.DomUtil.create('div', 'leaflet-control layers-btn');
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      container.innerHTML = `
        <button class="layers-toggle" title="Capas">
          ☰
        </button>
        <div class="layers-panel hidden">
          <div class="lp-section">
            <div class="lp-title">Mapa</div>
            <div class="lp-base"></div>
          </div>
          <div class="lp-section">
            <div class="lp-title">Datos</div>
            <div class="lp-dynamic">Cargando…</div>
          </div>
        </div>
      `;

      const toggleBtn = container.querySelector('.layers-toggle') as HTMLButtonElement;
      const panel = container.querySelector('.layers-panel') as HTMLDivElement;

      toggleBtn.onclick = () => {
        panel.classList.toggle('hidden');
      };

      // -------- Base layers (radio) --------
      const baseEl = container.querySelector('.lp-base')!;
      opts.baseLayers.forEach((b) => {
        const label = document.createElement('label');
        label.innerHTML = `
          <input type="radio" name="base-layer" />
          <span>${b.name}</span>
        `;
        const input = label.querySelector('input')!;
        input.checked = map.hasLayer(b.layer);

        input.onchange = (e) => {
          L.DomEvent.stopPropagation(e);
          opts.baseLayers.forEach((x) => map.removeLayer(x.layer));
          map.addLayer(b.layer);
        };

        baseEl.appendChild(label);
      });

      // -------- Dynamic layers (checkbox) --------
      const dynEl = container.querySelector('.lp-dynamic')!;

      const collapsed = new Set<string>(); // folders colapsadas
      const selectedDynamic = new Set<string>();
      const folderSnapshot = new Map<string, Set<string>>(); // folderId -> set(ids) recordados

      const renderTree = (containerEl: Element, nodes: CatalogNode[], depth = 0) => {
        for (const node of nodes) {

          if (node.type === 'folder') {
            const row = document.createElement('div');
            row.className = 'tree-folder';
            row.style.paddingLeft = `${depth * 12}px`;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tree-folder-btn';
            const isCollapsed = collapsed.has(node.$id);
            btn.textContent = isCollapsed ? '▸' : '▾';

            btn.onclick = (e) => {
              L.DomEvent.stopPropagation(e);
              L.DomEvent.preventDefault(e);

              if (collapsed.has(node.$id)) collapsed.delete(node.$id);
              else collapsed.add(node.$id);
              rerenderDynamic();
            };

            // tristate checkbox
            const check = document.createElement('input');
            check.type = 'checkbox';

            const state = computeFolderState(node, selectedDynamic);
            check.checked = state === 'all';
            check.indeterminate = state === 'some';

            check.onclick = (e) => {
              L.DomEvent.stopPropagation(e);
              L.DomEvent.preventDefault(e);
              cycleFolder(node);
            };

            function setAll(folder: any) {
              const ids = collectToggleIds(folder);
              ids.forEach((id) => selectedDynamic.add(id));
            }

            function setNone(folder: any) {
              const ids = collectToggleIds(folder);
              ids.forEach((id) => selectedDynamic.delete(id));
            }

            function restoreSnapshot(folder: any) {
              const snap = folderSnapshot.get(folder.id);
              if (!snap) {
                // si no hay snapshot, dejamos "some" sin tocar o puedes pasar a none
                return;
              }
              // primero limpia todo lo del folder
              setNone(folder);
              // y restaura
              snap.forEach((id) => selectedDynamic.add(id));
            }

            function rememberSnapshotIfSome(folder: any) {
              const state = computeFolderState(folder, selectedDynamic);
              if (state === 'some') {
                const ids = collectToggleIds(folder).filter((id) => selectedDynamic.has(id));
                folderSnapshot.set(folder.id, new Set(ids));
              } else {
                // opcional: si pasa a all o none, puedes borrar snapshot o conservarlo
                // para tu comportamiento lo ideal es CONSERVARLO para poder volver al intermedio
                // folderSnapshot.delete(folder.id);
              }
            }

            function cycleFolder(folder: any) {
              const state = computeFolderState(folder, selectedDynamic);

              if (state === 'none') {
                console.log("NONE");
                // none -> all
                setAll(folder);
              } else if (state === 'all') {
                console.log("ALL");
                console.log("SNAP ", folderSnapshot);
                // all -> restore intermediate (si existe) si no -> none
                if (folderSnapshot.has(folder.id)) {
                  restoreSnapshot(folder);
                } else {
                  setNone(folder);
                }
              } else {
                console.log('SOME');
                // some -> none (pero antes guardamos snapshot)
                rememberSnapshotIfSome(folder);
                setNone(folder);
              }

              opts.onDynamicChange(new Set(selectedDynamic));
              rerenderDynamic();
            }

            const title = document.createElement('span');
            title.className = 'tree-folder-title';
            title.textContent = node.name;

            row.appendChild(btn);
            row.appendChild(check);
            row.appendChild(title);
            containerEl.appendChild(row);

            if (!isCollapsed) {
              renderTree(containerEl, node.children, depth + 1);
            }
          }

          if (node.type === 'toggle') {
            const label = document.createElement('label');
            label.className = 'tree-toggle';
            label.style.paddingLeft = `${depth * 12 + 18}px`;

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = selectedDynamic.has(node.$id);

            function refreshSnapshots(nodes: CatalogNode[]) {
              for (const n of nodes) {
                if (n.type === 'folder') {
                  const state = computeFolderState(n, selectedDynamic);
                  const idsSelected = collectToggleIds(n).filter((id) => selectedDynamic.has(id));
                  folderSnapshot.set(n.$id, new Set(idsSelected));
                  refreshSnapshots(n.children);
                }
              }
            }

            input.onchange = (e) => {
              L.DomEvent.stopPropagation(e);
              if (input.checked) selectedDynamic.add(node.$id);
              else selectedDynamic.delete(node.$id);

              refreshSnapshots(cachedTree);

              console.log('[Layers] selected groups:', [...selectedDynamic]);
              opts.onDynamicChange(new Set(selectedDynamic));
              rerenderDynamic();
            };

            const span = document.createElement('span');
            span.textContent = node.name;

            label.appendChild(input);
            label.appendChild(span);

            containerEl.appendChild(label);
          }
        }
      };

      let cachedTree: CatalogNode[] = [];
      const rerenderDynamic = () => {
        dynEl.innerHTML = '';
        renderTree(dynEl, cachedTree, 0);
      };

      opts.dynamicTreeProvider().then((tree) => {
        cachedTree = tree;
        rerenderDynamic();
      });

      // cerrar al clickar fuera
      map.on('click', () => panel.classList.add('hidden'));
      map.on('zoomend', () => {
        rerenderDynamic();
      });
      return container;
    },
  });

  return new Control({ position });
}

function collectToggleIds(node: CatalogNode): string[] {
  if (node.type === 'toggle') return [node.$id];
  const out: string[] = [];
  for (const ch of node.children) out.push(...collectToggleIds(ch));
  return out;
}

type FolderState = 'none' | 'some' | 'all';

function computeFolderState(
  folder: Extract<CatalogNode, { type: 'folder' }>,
  selected: Set<string>,
): FolderState {
  const ids = collectToggleIds(folder);
  if (ids.length === 0) return 'none';

  let count = 0;
  for (const id of ids) if (selected.has(id)) count++;

  if (count === 0) return 'none';
  if (count === ids.length) return 'all';
  return 'some';
}
