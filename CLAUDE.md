# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Tetris en JavaScript vanilla con Canvas 2D. Tres archivos (`index.html`, `style.css`, `game.js`), sin `package.json`, sin build, sin linter y sin tests. La documentación del proyecto (README) está en español.

## Ejecutar

Abrir `index.html` en el navegador, o servir la carpeta con cualquier servidor estático (`python3 -m http.server 8000`, `npx serve .`). No hay comandos de build, lint ni test.

## Arquitectura

Toda la lógica vive en `game.js` (~300 líneas, `'use strict'`, scope global de script, sin módulos). Estado en variables globales (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, etc.) reinicializadas en `init()`.

- Las piezas (`PIECES`) son matrices cuadradas cuyos valores `1–7` son a la vez el tipo de pieza y el índice en `COLORS`. `board` guarda esos mismos índices (`0` = vacío), así que `drawBlock` pinta directamente desde el valor de la celda.
- Flujo de una pieza: `loop` (rAF, acumula `dropAccum` contra `dropInterval`) o `softDrop`/`hardDrop` → `lockPiece()` → `merge()` → `clearLines()` → `spawn()`. `spawn` promueve `next` a `current`, genera una nueva `next` y llama a `endGame()` si la pieza recién creada ya colisiona.
- `clearLines` también recalcula `level` y `dropInterval` (`max(100, 1000 - (level-1)*90)`); `init` fija `dropInterval = 1000`. Si se cambia la curva de velocidad hay que tocar ambos sitios.
- Puntuación: `LINE_SCORES[cleared] * level`; soft drop +1 por fila, hard drop +2 por celda.
- Rotación: `rotateCW` + wall kicks simples en `tryRotate` (desplazamientos `[0, -1, 1, -2, 2]` en X; no hay kicks verticales ni tablas SRS).
- `togglePause` cancela/reanuda el rAF y reutiliza el overlay de Game Over (`#overlay`) cambiando su título.

## Cosas a tener en cuenta

- Las dimensiones del canvas (`300×600` en `#board`, `COLS*BLOCK × ROWS*BLOCK`) están duplicadas en `index.html`; si cambian `COLS`, `ROWS` o `BLOCK` en `game.js` hay que actualizar `width`/`height` del canvas a mano. El canvas de la siguiente pieza (`#next-canvas`) está dibujado en una cuadrícula fija de 4×4 bloques de 30 px.
- `game.js` obtiene los elementos del DOM por `id` al cargar; renombrar un `id` en `index.html` rompe el script sin aviso.
- `endGame()` llama a `cancelAnimationFrame(animId)`, pero se invoca desde dentro de `loop` (vía `lockPiece` → `spawn`), que después ejecuta `animId = requestAnimationFrame(loop)`. Tras el Game Over el bucle sigue corriendo (solo redibuja; `gameOver` bloquea las teclas). Tenerlo en cuenta al modificar el ciclo de vida del bucle.
