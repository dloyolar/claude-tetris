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
- Hold: `hold` (tipo de pieza o `null`) y `canHold`. `holdPiece()` (teclas `C`/Shift) guarda `current.type` y, si ya había una, la recrea con `createPiece(type)` en orientación de spawn; si el slot estaba vacío llama a `spawn()`. `spawn()` pone `canHold = true`; `holdPiece` lo pone a `false` después. `drawHold()` atenúa el slot (alpha 0.3 + clase `.hold-locked`) mientras está bloqueado. Panel izquierdo en `index.html` (`#hold-canvas`, 4×4 de 30 px como `#next-canvas`).
- `togglePause` cancela/reanuda el rAF y reutiliza el overlay de Game Over (`#overlay`) cambiando su título.

- Temas: los colores de la UI son variables CSS en `:root` (oscuro, por defecto) y `[data-theme="light"]` en `style.css`. `applyTheme()` (`game.js`) fija `data-theme` en `<html>`, guarda la preferencia en `localStorage` (`tetris-theme`), cachea `--grid` en `gridColor` (usado por `drawGrid`) y fuerza `draw()`/`drawNext()` para que pausa/Game Over se repinten. Un script inline en `<head>` aplica el tema guardado antes de pintar. Al añadir colores nuevos, definirlos en ambos temas.

- Récords: `localStorage['tetris-records']` = `{ top: [{name, score, lines, level, date}] (máx 5, desc por score), bestCombo, maxLines }`. `loadRecords()` es tolerante a datos corruptos/ausentes y `saveRecords()` va en try/catch. `combo`/`maxComboThisGame` se actualizan en `lockPiece` (`clearLines()` ahora devuelve las líneas limpiadas; combo sube por cada lock que limpia y se resetea si no). `endGame()` → `finishRecords()` actualiza `bestCombo`/`maxLines` y, si `recordRank(score)` entra en el top, crea `pendingEntry` y muestra `#name-entry` (input `maxlength 12`, Enter o Guardar → `saveName()`); si se reinicia sin guardar, `init()` llama a `commitPendingEntry()` y guarda como "Anónimo". La tabla se pinta con `renderRecords()` en `#start-records` y `#over-records` (fila resaltada con `.rec-highlight`). El reseteo usa confirmación inline en el DOM (`setupReset('start'|'over')`, sin `alert/confirm`).
- Pantalla de inicio: `#start-screen` (overlay visible al cargar). `game.js` ya no llama a `init()` al final: lo hace el botón Jugar o Enter. Mientras `#start-screen` está visible, o el foco está en `#name-input`, el handler de `keydown` ignora las teclas de juego. Con `current`/`next` sin definir (antes de la primera partida) `applyTheme` no dibuja.

## Cosas a tener en cuenta

- Las dimensiones del canvas (`300×600` en `#board`, `COLS*BLOCK × ROWS*BLOCK`) están duplicadas en `index.html`; si cambian `COLS`, `ROWS` o `BLOCK` en `game.js` hay que actualizar `width`/`height` del canvas a mano. El canvas de la siguiente pieza (`#next-canvas`) está dibujado en una cuadrícula fija de 4×4 bloques de 30 px.
- `game.js` obtiene los elementos del DOM por `id` al cargar; renombrar un `id` en `index.html` rompe el script sin aviso.
- `endGame()` llama a `cancelAnimationFrame(animId)`, pero se invoca desde dentro de `loop` (vía `lockPiece` → `spawn`). Por eso `loop` comprueba `gameOver` tras `draw()` y no reprograma el rAF; así el bucle se detiene en Game Over y no sigue bloqueando piezas sobre el techo. Tenerlo en cuenta al modificar el ciclo de vida del bucle.
