/**
 * worker.js — Web Worker for running OpenSCAD WASM
 *
 * This worker loads the OpenSCAD WASM module and executes compilation
 * requests from the main thread. Communication is via postMessage.
 *
 * Messages IN (from main thread):
 *   { type: 'init' }
 *   { type: 'render', code: string, outputFormat: string, backend: string, extraFiles?: {name: string, data: Uint8Array}[] }
 *
 * Messages OUT (to main thread):
 *   { type: 'ready' }
 *   { type: 'log', level: string, message: string }
 *   { type: 'result', exitCode: number, output?: ArrayBuffer, outputFormat: string, duration: number, triangleCount?: number }
 *   { type: 'error', message: string }
 */

let instance = null;
let OpenSCADFactory = null;

self.onmessage = async (event) => {
  const { type, ...data } = event.data;

  switch (type) {
    case 'init':
      await initialize();
      break;
    case 'render':
      await render(data);
      break;
    default:
      log('warn', `Unknown message type: ${type}`);
  }
};

/**
 * Initialize the OpenSCAD WASM module.
 */
async function initialize() {
  try {
    log('info', 'Loading OpenSCAD WASM module...');

    // The WASM module should be available at the expected path relative to the web root
    // In production, this would be built via emscripten and placed alongside the web files
    const module = await import('../openscad.js');
    OpenSCADFactory = module.default;

    await createInstance();

    log('success', 'OpenSCAD WASM module loaded successfully.');
    self.postMessage({ type: 'ready' });
  } catch (err) {
    log('error', `Failed to load OpenSCAD WASM module: ${err.message || err}`);
    log('info', 'Running in demo mode — rendering is simulated.');
    self.postMessage({ type: 'ready', demo: true });
  }
}

/**
 * Create a fresh WASM instance. Called before each render since
 * callMain tears down the runtime (EXIT_RUNTIME=1).
 */
async function createInstance() {
  instance = await OpenSCADFactory({
    noInitialRun: true,
    print: (text) => log('info', text),
    printErr: (text) => {
      // OpenSCAD outputs warnings and progress to stderr
      if (text.startsWith('WARNING:') || text.startsWith('DEPRECATED:')) {
        log('warn', text);
      } else if (text.startsWith('ERROR:') || text.startsWith('TRACE:')) {
        log('error', text);
      } else {
        log('trace', text);
      }
    },
  });

  // Set up the virtual filesystem
  setupFilesystem();
}

/**
 * Set up the virtual filesystem with fonts and config.
 */
function setupFilesystem() {
  if (!instance) return;

  try {
    instance.FS.mkdir('/fonts');
  } catch {
    // Directory may already exist
  }

  // Write a minimal fontconfig configuration
  instance.FS.writeFile('/fonts/fonts.conf',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
</fontconfig>`
  );
}

/**
 * Run an OpenSCAD render.
 */
async function render({ code, outputFormat = 'stl', backend = 'manifold', extraFiles = [] }) {
  const start = performance.now();

  if (!OpenSCADFactory) {
    // Demo mode: generate a simple cube STL for preview
    log('info', 'Demo mode: generating sample geometry...');
    await simulateRender(code, outputFormat, start);
    return;
  }

  try {
    // Reinitialize the WASM instance for each render since callMain
    // tears down the runtime (EXIT_RUNTIME=1 in the Emscripten build).
    await createInstance();

    // Write the input file
    instance.FS.writeFile('input.scad', code);

    // Write any extra files (libraries, imports)
    for (const file of extraFiles) {
      instance.FS.writeFile(file.name, file.data);
    }

    const outputFile = `output.${outputFormat}`;
    const args = [
      'input.scad',
      `--backend=${backend}`,
      '-o', outputFile,
    ];

    log('info', `Rendering with: openscad ${args.join(' ')}`);

    // Run OpenSCAD
    let exitCode;
    try {
      exitCode = instance.callMain(args);
    } catch (callErr) {
      // Emscripten throws ExitStatus on exit() — treat as normal exit
      if (callErr.name === 'ExitStatus' || typeof callErr.status === 'number') {
        exitCode = callErr.status ?? 1;
      } else {
        throw callErr;
      }
    }
    const duration = performance.now() - start;

    if (exitCode === 0) {
      // Read the output file
      let output;
      try {
        const data = instance.FS.readFile(outputFile);
        output = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      } catch (readErr) {
        log('error', `Could not read output file: ${readErr.message}`);
        self.postMessage({ type: 'result', exitCode: 1, duration, outputFormat });
        return;
      }

      log('success', `Render completed in ${(duration / 1000).toFixed(2)}s`);
      self.postMessage(
        { type: 'result', exitCode, output, outputFormat, duration },
        [output] // Transfer the ArrayBuffer
      );

      // Clean up output file
      try { instance.FS.unlink(outputFile); } catch { /* ignore */ }
    } else {
      log('error', `Render failed with exit code ${exitCode}`);
      self.postMessage({ type: 'result', exitCode, duration, outputFormat });
    }
  } catch (err) {
    const duration = performance.now() - start;
    log('error', `Render error: ${err.message || err}`);
    self.postMessage({ type: 'result', exitCode: 1, duration, outputFormat });
  }
}

/**
 * Simulate a render in demo mode by generating a simple STL.
 */
async function simulateRender(code, outputFormat, start) {
  // Parse code to try to extract basic shape info
  await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate work

  // Generate a simple binary STL cube
  const demoCubeBuffer = generateDemoCubeSTL();
  const duration = performance.now() - start;

  log('success', `Demo render completed in ${(duration / 1000).toFixed(2)}s`);
  log('info', 'Note: This is a demo preview. Build the WASM module for actual rendering.');

  const output = demoCubeBuffer.buffer.slice(demoCubeBuffer.byteOffset, demoCubeBuffer.byteOffset + demoCubeBuffer.byteLength);
  self.postMessage(
    { type: 'result', exitCode: 0, output, outputFormat, duration },
    [output]
  );
}

/**
 * Generate a binary STL for a simple cube (demo mode).
 */
function generateDemoCubeSTL() {
  const s = 20; // Half-size
  // 12 triangles for a cube
  const triangles = [
    // Front face
    [[-s,-s, s], [ s,-s, s], [ s, s, s], [ 0, 0, 1]],
    [[-s,-s, s], [ s, s, s], [-s, s, s], [ 0, 0, 1]],
    // Back face
    [[ s,-s,-s], [-s,-s,-s], [-s, s,-s], [ 0, 0,-1]],
    [[ s,-s,-s], [-s, s,-s], [ s, s,-s], [ 0, 0,-1]],
    // Top face
    [[-s, s, s], [ s, s, s], [ s, s,-s], [ 0, 1, 0]],
    [[-s, s, s], [ s, s,-s], [-s, s,-s], [ 0, 1, 0]],
    // Bottom face
    [[-s,-s,-s], [ s,-s,-s], [ s,-s, s], [ 0,-1, 0]],
    [[-s,-s,-s], [ s,-s, s], [-s,-s, s], [ 0,-1, 0]],
    // Right face
    [[ s,-s, s], [ s,-s,-s], [ s, s,-s], [ 1, 0, 0]],
    [[ s,-s, s], [ s, s,-s], [ s, s, s], [ 1, 0, 0]],
    // Left face
    [[-s,-s,-s], [-s,-s, s], [-s, s, s], [-1, 0, 0]],
    [[-s,-s,-s], [-s, s, s], [-s, s,-s], [-1, 0, 0]],
  ];

  const numTriangles = triangles.length;
  const bufferSize = 84 + numTriangles * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Header (80 bytes) - just zeros
  // Triangle count
  view.setUint32(80, numTriangles, true);

  let offset = 84;
  for (const [v1, v2, v3, n] of triangles) {
    // Normal
    view.setFloat32(offset, n[0], true); offset += 4;
    view.setFloat32(offset, n[1], true); offset += 4;
    view.setFloat32(offset, n[2], true); offset += 4;
    // Vertex 1
    view.setFloat32(offset, v1[0], true); offset += 4;
    view.setFloat32(offset, v1[1], true); offset += 4;
    view.setFloat32(offset, v1[2], true); offset += 4;
    // Vertex 2
    view.setFloat32(offset, v2[0], true); offset += 4;
    view.setFloat32(offset, v2[1], true); offset += 4;
    view.setFloat32(offset, v2[2], true); offset += 4;
    // Vertex 3
    view.setFloat32(offset, v3[0], true); offset += 4;
    view.setFloat32(offset, v3[1], true); offset += 4;
    view.setFloat32(offset, v3[2], true); offset += 4;
    // Attribute byte count
    view.setUint16(offset, 0, true); offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * Log a message to the main thread.
 */
function log(level, message) {
  self.postMessage({ type: 'log', level, message });
}
