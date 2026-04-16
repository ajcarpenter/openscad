/**
 * stl-parser.js — Binary and ASCII STL parser
 *
 * Parses STL files into a flat Float32Array of vertices and normals
 * suitable for consumption by Three.js BufferGeometry.
 */

/**
 * Parse an STL file (binary or ASCII) and return geometry data.
 * @param {ArrayBuffer} buffer - The raw STL file contents.
 * @returns {{ vertices: Float32Array, normals: Float32Array, triangleCount: number }}
 */
export function parseSTL(buffer) {
  const view = new DataView(buffer);

  // Simple heuristic: check if the file starts with "solid" (ASCII STL)
  // but also has a plausible binary triangle count
  if (isASCII(buffer)) {
    return parseASCII(buffer);
  }
  return parseBinary(view);
}

/**
 * Check if an STL buffer is ASCII format.
 */
function isASCII(buffer) {
  // Binary STL: 80-byte header + 4-byte triangle count + triangles
  // ASCII STL starts with "solid"
  if (buffer.byteLength < 84) return true;

  const header = new Uint8Array(buffer, 0, 5);
  const isSolid = String.fromCharCode(...header) === 'solid';

  if (!isSolid) return false;

  // Additional check: read the triangle count from binary interpretation
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(80, true);
  const expectedSize = 84 + triangleCount * 50;

  // If the expected binary size matches, it's likely binary despite starting with "solid"
  if (Math.abs(expectedSize - buffer.byteLength) <= 1) return false;

  return true;
}

/**
 * Parse a binary STL file.
 */
function parseBinary(view) {
  const triangleCount = view.getUint32(80, true);
  const vertices = new Float32Array(triangleCount * 9);
  const normals = new Float32Array(triangleCount * 9);

  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    // Normal vector
    const nx = view.getFloat32(offset, true); offset += 4;
    const ny = view.getFloat32(offset, true); offset += 4;
    const nz = view.getFloat32(offset, true); offset += 4;

    // Three vertices
    for (let v = 0; v < 3; v++) {
      const idx = i * 9 + v * 3;
      vertices[idx]     = view.getFloat32(offset, true); offset += 4;
      vertices[idx + 1] = view.getFloat32(offset, true); offset += 4;
      vertices[idx + 2] = view.getFloat32(offset, true); offset += 4;

      normals[idx]     = nx;
      normals[idx + 1] = ny;
      normals[idx + 2] = nz;
    }

    // Attribute byte count (unused)
    offset += 2;
  }

  return { vertices, normals, triangleCount };
}

/**
 * Parse an ASCII STL file.
 */
function parseASCII(buffer) {
  const text = new TextDecoder().decode(buffer);
  const vertexPattern = /facet\s+normal\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+outer\s+loop\s+vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+endloop\s+endfacet/gi;

  const verts = [];
  const norms = [];
  let match;

  while ((match = vertexPattern.exec(text)) !== null) {
    const nx = parseFloat(match[1]);
    const ny = parseFloat(match[2]);
    const nz = parseFloat(match[3]);

    for (let v = 0; v < 3; v++) {
      verts.push(
        parseFloat(match[4 + v * 3]),
        parseFloat(match[5 + v * 3]),
        parseFloat(match[6 + v * 3])
      );
      norms.push(nx, ny, nz);
    }
  }

  return {
    vertices: new Float32Array(verts),
    normals: new Float32Array(norms),
    triangleCount: verts.length / 9
  };
}
