# News Map Frontend (Angular + Material + Leaflet + Appwrite)

Este repositorio contiene el frontend del **mapa global de noticias**, con marcadores sobre Leaflet y una interfaz moderna basada en Angular Material.
La plataforma se integra con **Appwrite 1.8.x** y utiliza **GeoJSON** para almacenar y consultar noticias georreferenciadas.

## Stack

- Angular (standalone)
- Angular Material
- Leaflet
- Appwrite JS SDK
- pnpm

## Requisitos

- Node.js (LTS recomendado)
- pnpm (recomendado)

Instalacion de pnpm:

```bash
npm i -g pnpm
```

## Configuración (Appwrite)

Configura el endpoint y el projectId en los siguientes entornos:

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
- Añade como host permitido: `http://localhost:4200` (o el que corresponda)

## Instalación

```bash
pnpm install
```

## Ejecucion en desarrollo

```bash
pnpm start
```

Acceso local:
- http://localhost:4200

## Build

```bash
pnpm build
```

Los artefactos se generan en `dist/`.

## Estructura recomendada

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

## Flujo de autenticacion (resumen)

- Seleccion de **Login** desde la barra superior
- Dialogo de acceso (email/password u OAuth)
- Al autenticar, se recupera el usuario desde Appwrite (`account.get()`)
- El usuario se guarda en el estado global de la aplicacion

## Scripts utiles

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

Este proyecto esta licenciado bajo **Apache License 2.0**. Ver [LICENSE](LICENSE).
