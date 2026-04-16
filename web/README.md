# OpenSCAD Web

A modern, web-native frontend for [OpenSCAD](https://openscad.org/) — the programmer's solid 3D CAD modeler.

This web interface wraps the existing OpenSCAD engine compiled to WebAssembly (via Emscripten), providing a beautiful browser-based experience while retaining the full power of the original C++ codebase.

## Architecture

```
┌──────────────────────────────────────────────┐
│  Browser UI (HTML/CSS/JS)                    │
│  ┌─────────────┐  ┌──────────────────────┐   │
│  │ CodeMirror   │  │  Three.js 3D Viewer  │   │
│  │ Editor       │  │  (STL rendering)     │   │
│  └──────┬──────┘  └──────────▲───────────┘   │
│         │                    │               │
│         ▼                    │               │
│  ┌──────────────────────────────────────┐    │
│  │  Web Worker                          │    │
│  │  ┌──────────────────────────────┐    │    │
│  │  │  OpenSCAD WASM Module        │    │    │
│  │  │  (C++ → Emscripten → WASM)   │    │    │
│  │  │  • Parser & Evaluator        │    │    │
│  │  │  • CGAL / Manifold backends  │    │    │
│  │  │  • STL/OBJ/DXF exporters     │    │    │
│  │  └──────────────────────────────┘    │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

### Design Philosophy

- **Retain original code**: The entire OpenSCAD C++ engine compiles to WASM unchanged. This means upstream improvements to parsing, geometry evaluation, CGAL, and Manifold backends are automatically available.
- **Web-native UI**: The frontend is built with standard web technologies (HTML5, CSS3, ES Modules) — no framework dependencies, no build step required for the UI.
- **Worker isolation**: The WASM engine runs in a Web Worker to keep the UI responsive during long renders.
- **Progressive enhancement**: The UI works in demo mode even without the WASM module built, allowing frontend development without the full Emscripten toolchain.

## Quick Start

### 1. Build the WASM Module

You need the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) installed.

```bash
# From the repository root
mkdir -p build-wasm && cd build-wasm

# Configure with Emscripten
emcmake cmake .. \
  -DNULLGL=ON \
  -DHEADLESS=ON \
  -DWASM_BUILD_TYPE=web \
  -DENABLE_CGAL=ON \
  -DENABLE_MANIFOLD=ON \
  -DCMAKE_BUILD_TYPE=Release

# Build
emmake make -j$(nproc) openscad
```

This produces `openscad.js` and `openscad.wasm` in the build directory.

### 2. Copy WASM Files

```bash
# Copy the built WASM module to the web directory
cp build-wasm/openscad.js web/
cp build-wasm/openscad.wasm web/
```

Or use the CMake install target which handles this automatically:
```bash
cmake --build build-wasm --target install-web
```

### 3. Serve the Web App

The web app requires an HTTP server (for ES modules and WASM loading).

```bash
# Using Python
cd web && python3 -m http.server 8080

# Using Node.js
npx serve web

# Using PHP
cd web && php -S localhost:8080
```

Open http://localhost:8080 in your browser.

### Demo Mode

If the WASM module is not built, the app runs in **demo mode** with a simulated render that generates a simple cube. This lets you work on the UI without needing the full Emscripten build.

## Features

- **Code Editor**: CodeMirror with OpenSCAD syntax highlighting, bracket matching, code folding
- **3D Viewer**: Three.js with orbit controls, grid, axes, wireframe mode
- **Console**: Real-time output from the OpenSCAD engine
- **Customizer**: Automatic parameter extraction from annotated variables
- **Export**: STL, OBJ, OFF, VRML, AMF, CSG, DXF, SVG formats
- **Examples**: Built-in example models to get started
- **Settings**: Configurable editor font/tab size, viewer colors, render backend
- **File I/O**: Open `.scad` files, save code, drag & drop support
- **Keyboard Shortcuts**:
  - `F5` / `Ctrl+Enter` — Render
  - `Ctrl+N` — New file
  - `Ctrl+O` — Open file
  - `Ctrl+S` — Save file
  - `Home` — Reset camera

## File Structure

```
web/
├── index.html          # Main HTML page
├── css/
│   └── style.css       # All styles (dark theme)
├── js/
│   ├── app.js          # Main application controller
│   ├── editor.js       # CodeMirror editor wrapper + OpenSCAD syntax mode
│   ├── viewer.js       # Three.js 3D viewer
│   ├── worker.js       # Web Worker for WASM compilation
│   ├── stl-parser.js   # Binary/ASCII STL parser
│   └── examples.js     # Built-in example models
├── openscad.js         # (Built) WASM glue code
├── openscad.wasm       # (Built) WASM binary
└── README.md           # This file
```

## Browser Support

- Chrome/Edge 90+
- Firefox 90+
- Safari 15+

Requires: ES Modules, WebAssembly, Web Workers, SharedArrayBuffer (for threading).

## Development

The web frontend has no build step — edit the files directly and refresh the browser. The only external dependencies are loaded from CDN:

- [CodeMirror 5](https://codemirror.net/5/) — Code editor
- [Three.js](https://threejs.org/) — 3D rendering
- [Lucide Icons](https://lucide.dev/) — UI icons

To develop the frontend without the WASM build, simply serve the `web/` directory — it automatically falls back to demo mode.

## Relationship to Desktop OpenSCAD

This web version uses the **exact same** C++ engine as desktop OpenSCAD, compiled to WebAssembly. The differences are:

| Feature | Desktop | Web |
|---------|---------|-----|
| GUI Framework | Qt6 | HTML/CSS/JS |
| 3D Rendering | OpenGL (native) | Three.js (WebGL) |
| File System | OS filesystem | Emscripten virtual FS |
| CSG Preview | OpenCSG (GPU) | N/A (full render only) |
| Font Support | System fonts | Bundled fonts |

The core engine — parser, evaluator, geometry backends (CGAL/Manifold), and exporters — is shared code.
