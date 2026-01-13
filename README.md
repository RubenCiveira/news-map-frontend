# News Map Frontend (Angular + Material + Leaflet + Appwrite)

Frontend para un **mapa mundi de noticias** con marcadores sobre un mapa (Leaflet) y una UI moderna (Angular Material).
El backend previsto es **Appwrite 1.8.x** usando **GeoJSON** para almacenar y consultar noticias georreferenciadas.

## Stack

- Angular (standalone)
- Angular Material
- Leaflet
- Appwrite JS SDK
- pnpm

## Requisitos

- Node.js (LTS recomendado)
- pnpm (recomendado)

Instalar pnpm:

```bash
npm i -g pnpm
```

## Configuración (Appwrite)

Configura el endpoint y el projectId en:

- `src/environments/environment.ts` (dev)
- `src/environments/environment.prod.ts` (prod)

Ejemplo:

```ts
export const environment = {
  production: false,
  appwrite: {
    endpoint: "http://localhost/v1",
    projectId: "YOUR_PROJECT_ID"
  }
};
```

En la consola de Appwrite:
- Project → Platforms → **Add platform → Web**
- Añade como host permitido: `http://localhost:4200` (o el que uses)

## Instalación

```bash
pnpm install
```

## Ejecutar en desarrollo

```bash
pnpm start
```

Abrir:
- http://localhost:4200

## Build

```bash
pnpm build
```

Los artefactos se generan en `dist/`.

## Estructura sugerida

```
src/app
  core/
    appwrite/         # cliente SDK de Appwrite
    auth/             # identidad (login/logout, store/estado de usuario)
    ui/               # toolbar y componentes base
  features/
    news-map/         # mapa y funcionalidades de noticias
  shared/             # modelos y utilidades comunes
```

## Flujo de autenticación (resumen)

- Click en **Login** (toolbar)
- Diálogo de login (email/password u OAuth)
- Al autenticar, se recupera el usuario desde Appwrite (`account.get()`)
- El usuario se guarda en el estado global de la app

## Scripts útiles

```bash
pnpm start
pnpm test
pnpm lint
pnpm build
```

## Roadmap

- [ ] Consultas GeoJSON en Appwrite y pintado de marcadores
- [ ] Filtros: fecha/proveedor/tags/radio/viewport
- [ ] Clustering de marcadores
- [ ] Panel lateral con lista y detalle de noticia
- [ ] Favoritos por usuario

## Licencia

Este proyecto está licenciado bajo **Apache License 2.0**. Ver [LICENSE](LICENSE).
