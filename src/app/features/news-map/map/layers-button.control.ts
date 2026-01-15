import * as L from 'leaflet';

export type FixedLayer = {
  id: string;
  name: string;
  type: 'base' | 'overlay';
  layer: L.Layer;
};

export type DynamicLayer = {
  $id: string;
  name: string;
  zoomMin?: number;
  zoomMax?: number;
};

export function createLayersButtonControl(opts: {
  position?: L.ControlPosition;
  baseLayers: FixedLayer[];
  overlays: FixedLayer[];
  dynamicLayersProvider: () => Promise<DynamicLayer[]>;
  onDynamicChange: (selectedIds: Set<string>) => void;
}) {
  const position = opts.position ?? 'topright';
  const selectedDynamic = new Set<string>();

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

        input.onchange = () => {
          opts.baseLayers.forEach((x) => map.removeLayer(x.layer));
          map.addLayer(b.layer);
        };

        baseEl.appendChild(label);
      });

      // -------- Dynamic layers (checkbox) --------
      const dynEl = container.querySelector('.lp-dynamic')!;
      const renderDynamicLayers = (layers: DynamicLayer[]) => {
        dynEl.innerHTML = '';

        const zoom = map.getZoom();
        console.log("IN " + zoom);

        layers.forEach((layer) => {
          const label = document.createElement('label');

          const input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = selectedDynamic.has(layer.$id);

          input.onchange = () => {
            if (input.checked) {
              selectedDynamic.add(layer.$id);
            } else {
              selectedDynamic.delete(layer.$id);
            }
            opts.onDynamicChange(new Set(selectedDynamic));
          };

          const span = document.createElement('span');
          span.textContent = `${layer.name}`;

          label.appendChild(input);
          label.appendChild(span);
          dynEl.appendChild(label);
        });
      };

      let cachedLayers: DynamicLayer[] = [];

      opts.dynamicLayersProvider().then((layers) => {
        cachedLayers = layers;
        renderDynamicLayers(layers);
      });

      // cerrar al clickar fuera
      map.on('click', () => panel.classList.add('hidden'));
      map.on('zoomend', () => {
        if (cachedLayers.length > 0) {
          renderDynamicLayers(cachedLayers);
        }
      });
      return container;
    },
  });

  return new Control({ position });
}
