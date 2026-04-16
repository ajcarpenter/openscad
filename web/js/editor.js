/**
 * editor.js — CodeMirror editor wrapper for OpenSCAD Web
 *
 * Wraps CodeMirror 5 with OpenSCAD-specific configuration,
 * syntax highlighting, and utility methods.
 */

// OpenSCAD language mode for CodeMirror
// Registered as "openscad" mode based on C-like syntax
/* global CodeMirror */
CodeMirror.defineMode('openscad', (config) => {
  return CodeMirror.getMode(config, {
    name: 'clike',
    keywords: words(
      'module function if else for let each assert echo ' +
      'include use true false undef'
    ),
    blockKeywords: words('module function if else for let'),
    defKeywords: words('module function'),
    typeFirstDefinitions: false,
    atoms: words('true false undef PI'),
    builtin: words(
      // 3D primitives
      'cube sphere cylinder polyhedron ' +
      // 2D primitives
      'circle square polygon text ' +
      // Transformations
      'translate rotate scale mirror multmatrix color ' +
      'resize minkowski hull render ' +
      // Boolean operations
      'union difference intersection ' +
      // Extrusions
      'linear_extrude rotate_extrude ' +
      // Math
      'abs sign min max sin cos tan asin acos atan atan2 ' +
      'floor ceil round ln log exp sqrt pow ' +
      'len str chr ord concat lookup search ' +
      'version version_num ' +
      // List operations
      'each ' +
      // Special variables
      '$fn $fa $fs $t $vpr $vpt $vpd $vpf $children ' +
      // Other
      'children import surface projection ' +
      'offset fill ' +
      'group roof'
    ),
    hooks: {
      '/': (stream) => {
        if (stream.eat('/')) {
          // Check for customizer annotations: // [param:desc]
          if (stream.match(/\s*\[.*\]/)) {
            stream.skipToEnd();
            return 'annotation';
          }
          stream.skipToEnd();
          return 'comment';
        }
        return false;
      },
    },
    modeProps: {
      fold: ['brace'],
    },
  });
});

// Register MIME type
CodeMirror.defineMIME('text/x-openscad', 'openscad');

function words(str) {
  const obj = {};
  str.split(' ').forEach((w) => { obj[w] = true; });
  return obj;
}

export class Editor {
  /**
   * @param {HTMLElement} container - The DOM element to mount the editor in.
   * @param {object} [options]
   */
  constructor(container, options = {}) {
    this.container = container;
    this._onChange = null;

    this.cm = CodeMirror(container, {
      value: options.initialValue || defaultCode(),
      mode: 'openscad',
      theme: 'monokai',
      lineNumbers: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      indentUnit: options.tabSize || 2,
      tabSize: options.tabSize || 2,
      indentWithTabs: false,
      lineWrapping: false,
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      scrollbarStyle: 'native',
      viewportMargin: Infinity,
      extraKeys: {
        'Tab': (cm) => {
          if (cm.somethingSelected()) {
            cm.indentSelection('add');
          } else {
            cm.replaceSelection('  ', 'end');
          }
        },
        'Shift-Tab': (cm) => cm.indentSelection('subtract'),
      },
    });

    // Force refresh on next frame (fixes sizing issues)
    requestAnimationFrame(() => this.cm.refresh());
  }

  // ---------- Public API ----------

  /**
   * Get the current editor content.
   */
  getValue() {
    return this.cm.getValue();
  }

  /**
   * Set the editor content.
   */
  setValue(code) {
    this.cm.setValue(code);
    this.cm.clearHistory();
  }

  /**
   * Register a change callback.
   */
  onChange(callback) {
    this._onChange = callback;
    this.cm.on('change', () => callback(this.getValue()));
  }

  /**
   * Set font size.
   */
  setFontSize(size) {
    this.container.querySelector('.CodeMirror').style.fontSize = size + 'px';
    this.cm.refresh();
  }

  /**
   * Set tab size.
   */
  setTabSize(size) {
    this.cm.setOption('indentUnit', size);
    this.cm.setOption('tabSize', size);
  }

  /**
   * Toggle word wrap.
   */
  toggleWrap() {
    const current = this.cm.getOption('lineWrapping');
    this.cm.setOption('lineWrapping', !current);
    return !current;
  }

  /**
   * Refresh the editor layout (call after resize).
   */
  refresh() {
    this.cm.refresh();
  }

  /**
   * Focus the editor.
   */
  focus() {
    this.cm.focus();
  }

  /**
   * Extract customizer parameters from the code.
   * Looks for patterns like:
   *   varname = value; // [min:step:max] or [val1, val2, val3]
   *   varname = value; // Description
   */
  extractParameters() {
    const code = this.getValue();
    const params = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match: varname = value; // comment
      const match = line.match(
        /^\s*(\w+)\s*=\s*(.+?)\s*;\s*\/\/\s*(.+)$/
      );
      if (!match) continue;

      const [, name, rawValue, comment] = match;
      const value = rawValue.trim();

      // Parse annotation
      const annotation = parseAnnotation(comment.trim());

      params.push({
        name,
        value,
        line: i,
        ...annotation,
      });
    }

    return params;
  }
}

/**
 * Parse a customizer annotation comment.
 */
function parseAnnotation(comment) {
  // Range: [min:max] or [min:step:max]
  const rangeMatch = comment.match(/^\[([\d.+-]+):([\d.+-]+)(?::([\d.+-]+))?\](?:\s*(.*))?$/);
  if (rangeMatch) {
    if (rangeMatch[3] !== undefined) {
      // Three-part range: [min:step:max]
      return {
        type: 'range',
        min: parseFloat(rangeMatch[1]),
        step: parseFloat(rangeMatch[2]),
        max: parseFloat(rangeMatch[3]),
        description: rangeMatch[4] || '',
      };
    }
    // Two-part range: [min:max]
    return {
      type: 'range',
      min: parseFloat(rangeMatch[1]),
      max: parseFloat(rangeMatch[2]),
      step: 1,
      description: rangeMatch[4] || '',
    };
  }

  // Dropdown: [value1, value2, value3]
  const dropdownMatch = comment.match(/^\[(.+)\](?:\s*(.*))?$/);
  if (dropdownMatch) {
    const options = dropdownMatch[1].split(',').map((s) => s.trim());
    return {
      type: 'dropdown',
      options,
      description: dropdownMatch[2] || '',
    };
  }

  // Boolean: checkbox
  return {
    type: 'text',
    description: comment,
  };
}

/**
 * Default code shown when the editor loads.
 */
function defaultCode() {
  return `// OpenSCAD Web — Welcome!
// Press F5 or click Render to preview your model.
// Try editing this code and re-rendering.

// Parameters
wall = 2;          // [1:0.5:5] Wall thickness
size = 30;         // [10:60] Box size
rounded = true;    // Round corners

module rounded_box(s, wall, r=3) {
  difference() {
    minkowski() {
      cube([s - 2*r, s - 2*r, s/2 - r], center=true);
      sphere(r=r, $fn=32);
    }
    translate([0, 0, wall])
      minkowski() {
        cube([s - 2*wall - 2*r, s - 2*wall - 2*r, s/2], center=true);
        sphere(r=r/2, $fn=32);
      }
  }
}

if (rounded) {
  rounded_box(size, wall);
} else {
  difference() {
    cube([size, size, size/2], center=true);
    translate([0, 0, wall])
      cube([size - 2*wall, size - 2*wall, size/2], center=true);
  }
}
`;
}
