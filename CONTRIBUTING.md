# Guia de contribucion

Gracias por el interes en colaborar con el proyecto. Esta guia establece las pautas para mantener una colaboracion consistente y profesional.

## Requisitos
- Node.js (LTS recomendado)
- pnpm

## Desarrollo local
```bash
pnpm install
pnpm start
```

## Estilo y arquitectura
- TypeScript + Angular standalone
- Preferir componentes y servicios pequenos y cohesionados
- Evitar acoplar la UI con la infraestructura (Appwrite) de forma directa

## Pull requests
1. Crea una rama desde `master`
2. Verifica que el proyecto compila y pasa pruebas y lint
3. Describe claramente el cambio, el objetivo y el impacto
