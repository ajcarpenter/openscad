/**
 * app.js — Main application controller for OpenSCAD Web
 *
 * Orchestrates the editor, 3D viewer, WASM worker, console,
 * file I/O, and UI interactions.
 */

import { Editor } from './editor.js';
import { Viewer } from './viewer.js';
import { examples } from './examples.js';

class App {
  constructor() {
    // State
    this.isRendering = false;
    this.isWasmReady = false;
    this.isDemoMode = false;
    this.currentFilename = 'untitled.scad';
    this.lastRenderOutput = null;
    this.lastRenderFormat = null;

    // UI Elements
    this.elements = {
      btnRender: document.getElementById('btn-render'),
      btnNew: document.getElementById('btn-new'),
      btnOpen: document.getElementById('btn-open'),
      btnSave: document.getElementById('btn-save'),
      btnExport: document.getElementById('btn-export'),
      btnExamples: document.getElementById('btn-examples'),
      btnSettings: document.getElementById('btn-settings'),
      btnClearConsole: document.getElementById('btn-clear-console'),
      btnResetView: document.getElementById('btn-reset-view'),
      btnViewTop: document.getElementById('btn-view-top'),
      btnViewFront: document.getElementById('btn-view-front'),
      btnToggleGrid: document.getElementById('btn-toggle-grid'),
      btnToggleAxes: document.getElementById('btn-toggle-axes'),
      btnToggleWireframe: document.getElementById('btn-toggle-wireframe'),
      btnFormat: document.getElementById('btn-format'),
      btnWrap: document.getElementById('btn-wrap'),
      exportFormat: document.getElementById('export-format'),
      fileInput: document.getElementById('file-input'),
      downloadLink: document.getElementById('download-link'),
      editorContainer: document.getElementById('editor-container'),
      viewerCanvas: document.getElementById('viewer-canvas'),
      viewerStatus: document.getElementById('viewer-status'),
      renderingOverlay: document.getElementById('rendering-overlay'),
      consoleContent: document.getElementById('console-content'),
      parametersContent: document.getElementById('parameters-content'),
      statusText: document.getElementById('status-text'),
      editorFilename: document.getElementById('editor-filename'),
      examplesModal: document.getElementById('examples-modal'),
      settingsModal: document.getElementById('settings-modal'),
      exampleGrid: document.getElementById('example-grid'),
      resizeEditor: document.getElementById('resize-editor'),
      resizeConsole: document.getElementById('resize-console'),
      toastContainer: document.getElementById('toast-container'),
      tabParameters: document.getElementById('tab-parameters'),
      // Settings inputs
      settingBackend: document.getElementById('setting-backend'),
      settingFn: document.getElementById('setting-fn'),
      settingFontSize: document.getElementById('setting-fontsize'),
      settingTabSize: document.getElementById('setting-tabsize'),
      settingBgColor: document.getElementById('setting-bgcolor'),
      settingModelColor: document.getElementById('setting-modelcolor'),
    };

    // Initialize components
    this.editor = new Editor(this.elements.editorContainer);
    this.viewer = new Viewer(this.elements.viewerCanvas);

    // Initialize worker
    this.worker = new Worker('js/worker.js', { type: 'module' });
    this.worker.onmessage = (e) => this._onWorkerMessage(e);

    // Load saved settings
    this._loadSettings();

    // Set up event listeners
    this._setupEventListeners();
    this._setupResizeHandles();
    this._populateExamples();

    // Initialize WASM
    this.worker.postMessage({ type: 'init' });

    // Log welcome message
    this._logConsole('info', 'Welcome to OpenSCAD Web!');
    this._logConsole('info', 'Initializing WASM engine...');
  }

  // ---------- Rendering ----------

  render() {
    if (this.isRendering) return;

    const code = this.editor.getValue();
    if (!code.trim()) {
      this._toast('warning', 'Nothing to render — the editor is empty.');
      return;
    }

    this.isRendering = true;
    this._updateRenderButton(true);
    this.elements.renderingOverlay.classList.remove('hidden');
    this.elements.viewerStatus.classList.add('hidden');
    this._setStatus('Rendering...');

    const format = 'stl'; // Always render to binary STL for the viewer
    const backend = this.elements.settingBackend.value;

    this.worker.postMessage({
      type: 'render',
      code,
      outputFormat: format,
      backend,
    });
  }

  // ---------- File Operations ----------

  newFile() {
    if (this.editor.getValue().trim() && !confirm('Discard current changes?')) return;
    this.editor.setValue('');
    this.currentFilename = 'untitled.scad';
    this.elements.editorFilename.textContent = this.currentFilename;
    this.viewer.clearModel();
    this.elements.viewerStatus.classList.remove('hidden');
    this.lastRenderOutput = null;
    this._updateExportButtons(false);
    this._logConsole('info', 'New file created.');
  }

  openFile() {
    this.elements.fileInput.click();
  }

  saveFile() {
    const code = this.editor.getValue();
    const blob = new Blob([code], { type: 'text/plain' });
    this._downloadBlob(blob, this.currentFilename);
    this._toast('success', `Saved as ${this.currentFilename}`);
  }

  exportModel() {
    if (!this.lastRenderOutput) {
      this._toast('warning', 'Nothing to export. Render your model first.');
      return;
    }

    const selectedFormat = this.elements.exportFormat.value;
    const needsReExport = selectedFormat !== this.lastRenderFormat;

    if (needsReExport && !this.isDemoMode) {
      // Re-render with the selected format
      this.isRendering = true;
      this._updateRenderButton(true);
      this.elements.renderingOverlay.classList.remove('hidden');
      this._setStatus('Exporting...');

      const code = this.editor.getValue();
      const backend = this.elements.settingBackend.value;

      this.worker.postMessage({
        type: 'render',
        code,
        outputFormat: selectedFormat,
        backend,
      });
      return;
    }

    // Download the last render output
    const blob = new Blob([this.lastRenderOutput], { type: 'application/octet-stream' });
    const filename = this.currentFilename.replace(/\.\w+$/, '') + '.' + this.lastRenderFormat;
    this._downloadBlob(blob, filename);
    this._toast('success', `Exported as ${filename}`);
  }

  // ---------- Worker Messages ----------

  _onWorkerMessage(event) {
    const { type, ...data } = event.data;

    switch (type) {
      case 'ready':
        this.isWasmReady = true;
        this.isDemoMode = !!data.demo;
        this._setStatus('Ready');
        if (this.isDemoMode) {
          this._logConsole('warn', 'WASM module not found — running in demo mode.');
          this._logConsole('info', 'Build the WASM module with emscripten to enable full rendering.');
          this._logConsole('info', 'See web/README.md for build instructions.');
        }
        break;

      case 'log':
        this._logConsole(data.level, data.message);
        break;

      case 'result':
        this._onRenderResult(data);
        break;

      case 'error':
        this._logConsole('error', data.message);
        this.isRendering = false;
        this._updateRenderButton(false);
        this.elements.renderingOverlay.classList.add('hidden');
        this._setStatus('Error');
        break;
    }
  }

  _onRenderResult({ exitCode, output, outputFormat, duration }) {
    this.isRendering = false;
    this._updateRenderButton(false);
    this.elements.renderingOverlay.classList.add('hidden');

    if (exitCode === 0 && output) {
      this.lastRenderOutput = output;
      this.lastRenderFormat = outputFormat;
      this._updateExportButtons(true);

      // If the output is STL, load it into the viewer
      if (outputFormat === 'stl') {
        const result = this.viewer.loadSTL(output);
        if (result) {
          this._setStatus(`${result.triangleCount.toLocaleString()} triangles · ${(duration / 1000).toFixed(2)}s`);
        }
      } else {
        // For non-STL export, just download it
        const blob = new Blob([output], { type: 'application/octet-stream' });
        const filename = this.currentFilename.replace(/\.\w+$/, '') + '.' + outputFormat;
        this._downloadBlob(blob, filename);
        this._toast('success', `Exported as ${filename}`);
        this._setStatus('Export complete');
      }
    } else {
      this._setStatus('Render failed');
      this._toast('error', 'Render failed. Check the console for details.');
    }
  }

  // ---------- UI Helpers ----------

  _updateRenderButton(rendering) {
    const btn = this.elements.btnRender;
    if (rendering) {
      btn.classList.add('rendering');
      btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span class="btn-label">Rendering…</span>';
    } else {
      btn.classList.remove('rendering');
      btn.innerHTML = '<i class="lucide lucide-play"></i><span class="btn-label">Render</span>';
    }
  }

  _updateExportButtons(enabled) {
    this.elements.btnExport.disabled = !enabled;
    this.elements.exportFormat.disabled = !enabled;
  }

  _setStatus(text) {
    this.elements.statusText.textContent = text;
  }

  _logConsole(level, message) {
    const el = this.elements.consoleContent;
    const line = document.createElement('div');
    line.className = `console-line ${level}`;
    line.textContent = message;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  clearConsole() {
    this.elements.consoleContent.innerHTML = '';
  }

  _toast(type, message, duration = 4000) {
    const container = this.elements.toastContainer;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      toast.addEventListener('animationend', () => toast.remove());
    }, duration);
  }

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = this.elements.downloadLink;
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Customizer ----------

  _updateParameters() {
    const params = this.editor.extractParameters();
    const container = this.elements.parametersContent;

    if (params.length === 0) {
      container.innerHTML = '<p class="placeholder-text">No parameters detected. Add customizer annotations to your code to enable the customizer panel.</p>';
      return;
    }

    container.innerHTML = '';

    const group = document.createElement('div');
    group.className = 'param-group';

    const title = document.createElement('div');
    title.className = 'param-group-title';
    title.textContent = 'Parameters';
    group.appendChild(title);

    for (const param of params) {
      const row = document.createElement('div');
      row.className = 'param-row';

      const label = document.createElement('label');
      label.className = 'param-label';
      label.textContent = param.name;
      label.title = param.description || param.name;
      row.appendChild(label);

      let input;

      if (param.type === 'range') {
        input = document.createElement('input');
        input.type = 'range';
        input.className = 'param-input';
        input.min = param.min;
        input.max = param.max;
        input.step = param.step;
        input.value = parseFloat(param.value) || param.min;

        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'param-label';
        valueDisplay.style.minWidth = '30px';
        valueDisplay.style.textAlign = 'right';
        valueDisplay.textContent = input.value;

        input.addEventListener('input', () => {
          valueDisplay.textContent = input.value;
          this._updateParamInEditor(param.name, input.value, param.line);
        });

        row.appendChild(input);
        row.appendChild(valueDisplay);
      } else if (param.type === 'dropdown') {
        input = document.createElement('select');
        input.className = 'param-input';
        for (const opt of param.options) {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          if (opt === param.value || opt === param.value.replace(/"/g, '')) {
            option.selected = true;
          }
          input.appendChild(option);
        }
        input.addEventListener('change', () => {
          this._updateParamInEditor(param.name, input.value, param.line);
        });
        row.appendChild(input);
      } else if (param.value === 'true' || param.value === 'false') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'param-input';
        input.checked = param.value === 'true';
        input.addEventListener('change', () => {
          this._updateParamInEditor(param.name, input.checked.toString(), param.line);
        });
        row.appendChild(input);
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'param-input';
        input.value = param.value;
        input.addEventListener('change', () => {
          this._updateParamInEditor(param.name, input.value, param.line);
        });
        row.appendChild(input);
      }

      group.appendChild(row);
    }

    container.appendChild(group);
  }

  _updateParamInEditor(name, value, lineNumber) {
    const cm = this.editor.cm;
    const lineContent = cm.getLine(lineNumber);
    if (!lineContent) return;

    // Replace the value in the line while preserving the comment
    const updated = lineContent.replace(
      new RegExp(`^(\\s*${name}\\s*=\\s*).+?(\\s*;.*)$`),
      `$1${value}$2`
    );

    if (updated !== lineContent) {
      cm.replaceRange(
        updated,
        { line: lineNumber, ch: 0 },
        { line: lineNumber, ch: lineContent.length }
      );
    }
  }

  // ---------- Examples ----------

  _populateExamples() {
    const grid = this.elements.exampleGrid;
    grid.innerHTML = '';

    for (const example of examples) {
      const card = document.createElement('div');
      card.className = 'example-card';
      card.innerHTML = `<h3>${example.name}</h3><p>${example.description}</p>`;
      card.addEventListener('click', () => {
        this.editor.setValue(example.code);
        this.currentFilename = example.name.toLowerCase().replace(/\s+/g, '_') + '.scad';
        this.elements.editorFilename.textContent = this.currentFilename;
        this.elements.examplesModal.close();
        this._updateParameters();
        this._toast('info', `Loaded example: ${example.name}`);
      });
      grid.appendChild(card);
    }
  }

  // ---------- Settings ----------

  _loadSettings() {
    try {
      const saved = localStorage.getItem('openscad-web-settings');
      if (!saved) return;
      const settings = JSON.parse(saved);

      if (settings.backend) this.elements.settingBackend.value = settings.backend;
      if (settings.fontSize) {
        this.elements.settingFontSize.value = settings.fontSize;
        this.editor.setFontSize(settings.fontSize);
      }
      if (settings.tabSize) {
        this.elements.settingTabSize.value = settings.tabSize;
        this.editor.setTabSize(settings.tabSize);
      }
      if (settings.bgColor) {
        this.elements.settingBgColor.value = settings.bgColor;
        this.viewer.setBackgroundColor(settings.bgColor);
      }
      if (settings.modelColor) {
        this.elements.settingModelColor.value = settings.modelColor;
        this.viewer.setModelColor(settings.modelColor);
      }
    } catch {
      // Ignore errors from localStorage
    }
  }

  _saveSettings() {
    try {
      localStorage.setItem('openscad-web-settings', JSON.stringify({
        backend: this.elements.settingBackend.value,
        fontSize: parseInt(this.elements.settingFontSize.value),
        tabSize: parseInt(this.elements.settingTabSize.value),
        bgColor: this.elements.settingBgColor.value,
        modelColor: this.elements.settingModelColor.value,
      }));
    } catch {
      // Ignore errors from localStorage
    }
  }

  // ---------- Event Listeners ----------

  _setupEventListeners() {
    // Toolbar buttons
    this.elements.btnRender.addEventListener('click', () => this.render());
    this.elements.btnNew.addEventListener('click', () => this.newFile());
    this.elements.btnOpen.addEventListener('click', () => this.openFile());
    this.elements.btnSave.addEventListener('click', () => this.saveFile());
    this.elements.btnExport.addEventListener('click', () => this.exportModel());
    this.elements.btnClearConsole.addEventListener('click', () => this.clearConsole());

    // Viewer controls
    this.elements.btnResetView.addEventListener('click', () => this.viewer.resetCamera());
    this.elements.btnViewTop.addEventListener('click', () => this.viewer.viewTop());
    this.elements.btnViewFront.addEventListener('click', () => this.viewer.viewFront());

    this.elements.btnToggleGrid.addEventListener('click', () => {
      const on = this.viewer.toggleGrid();
      this.elements.btnToggleGrid.classList.toggle('active', on);
    });
    this.elements.btnToggleAxes.addEventListener('click', () => {
      const on = this.viewer.toggleAxes();
      this.elements.btnToggleAxes.classList.toggle('active', on);
    });
    this.elements.btnToggleWireframe.addEventListener('click', () => {
      const on = this.viewer.toggleWireframe();
      this.elements.btnToggleWireframe.classList.toggle('active', on);
    });

    // Editor controls
    this.elements.btnWrap.addEventListener('click', () => {
      const on = this.editor.toggleWrap();
      this.elements.btnWrap.classList.toggle('active', on);
    });

    // Set initial active states for toggles
    this.elements.btnToggleGrid.classList.add('active');
    this.elements.btnToggleAxes.classList.add('active');

    // File input
    this.elements.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        this.editor.setValue(ev.target.result);
        this.currentFilename = file.name;
        this.elements.editorFilename.textContent = file.name;
        this._updateParameters();
        this._toast('info', `Opened ${file.name}`);
      };
      reader.readAsText(file);
      this.elements.fileInput.value = ''; // Reset for re-opening same file
    });

    // Drag & drop on editor
    const editorEl = this.elements.editorContainer;
    editorEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      editorEl.style.outline = '2px dashed var(--accent)';
    });
    editorEl.addEventListener('dragleave', () => {
      editorEl.style.outline = '';
    });
    editorEl.addEventListener('drop', (e) => {
      e.preventDefault();
      editorEl.style.outline = '';
      const file = e.dataTransfer.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          this.editor.setValue(ev.target.result);
          this.currentFilename = file.name;
          this.elements.editorFilename.textContent = file.name;
          this._updateParameters();
          this._toast('info', `Opened ${file.name}`);
        };
        reader.readAsText(file);
      }
    });

    // Modals
    this.elements.btnExamples.addEventListener('click', () => {
      this.elements.examplesModal.showModal();
    });
    document.getElementById('close-examples').addEventListener('click', () => {
      this.elements.examplesModal.close();
    });
    this.elements.btnSettings.addEventListener('click', () => {
      this.elements.settingsModal.showModal();
    });
    document.getElementById('close-settings').addEventListener('click', () => {
      this.elements.settingsModal.close();
    });

    // Close modals on backdrop click
    for (const modal of [this.elements.examplesModal, this.elements.settingsModal]) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.close();
      });
    }

    // Settings changes
    this.elements.settingFontSize.addEventListener('change', () => {
      this.editor.setFontSize(parseInt(this.elements.settingFontSize.value));
      this._saveSettings();
    });
    this.elements.settingTabSize.addEventListener('change', () => {
      this.editor.setTabSize(parseInt(this.elements.settingTabSize.value));
      this._saveSettings();
    });
    this.elements.settingBgColor.addEventListener('input', () => {
      this.viewer.setBackgroundColor(this.elements.settingBgColor.value);
      this._saveSettings();
    });
    this.elements.settingModelColor.addEventListener('input', () => {
      this.viewer.setModelColor(this.elements.settingModelColor.value);
      this._saveSettings();
    });
    this.elements.settingBackend.addEventListener('change', () => {
      this._saveSettings();
    });

    // Console tabs
    this.elements.tabParameters.addEventListener('click', () => this._switchConsoleTab('parameters'));
    document.querySelector('[data-tab="console"]').addEventListener('click', () => this._switchConsoleTab('console'));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // F5 or Ctrl+Enter: Render
      if (e.key === 'F5' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        this.render();
      }
      // Ctrl+N: New
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        this.newFile();
      }
      // Ctrl+O: Open
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        this.openFile();
      }
      // Ctrl+S: Save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        this.saveFile();
      }
      // Home: Reset view
      if (e.key === 'Home' && !e.ctrlKey && !e.altKey) {
        const active = document.activeElement;
        const isEditor = active && active.closest('.CodeMirror');
        if (!isEditor) {
          e.preventDefault();
          this.viewer.resetCamera();
        }
      }
    });

    // Update parameters when editor changes (debounced)
    let paramTimer;
    this.editor.onChange(() => {
      clearTimeout(paramTimer);
      paramTimer = setTimeout(() => this._updateParameters(), 500);
    });

    // Initial parameter extraction
    this._updateParameters();
  }

  _switchConsoleTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.console-panel .panel-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    // Show/hide content
    const consoleEl = document.getElementById('console-content');
    const paramsEl = document.getElementById('parameters-content');
    consoleEl.classList.toggle('hidden', tab !== 'console');
    paramsEl.classList.toggle('hidden', tab !== 'parameters');
    consoleEl.style.display = tab === 'console' ? '' : 'none';
    paramsEl.style.display = tab === 'parameters' ? '' : 'none';
  }

  // ---------- Resize Handles ----------

  _setupResizeHandles() {
    // Vertical resize (editor/viewer split)
    this._setupDragHandle(this.elements.resizeEditor, 'vertical');

    // Horizontal resize (console height)
    this._setupDragHandle(this.elements.resizeConsole, 'horizontal');
  }

  _setupDragHandle(handle, direction) {
    let startPos;
    let startSize;

    const onMouseDown = (e) => {
      e.preventDefault();
      handle.classList.add('dragging');
      document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';

      if (direction === 'vertical') {
        startPos = e.clientX;
        startSize = document.getElementById('panel-editor').getBoundingClientRect().width;
      } else {
        startPos = e.clientY;
        startSize = document.getElementById('console-panel').getBoundingClientRect().height;
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (direction === 'vertical') {
        const delta = e.clientX - startPos;
        const newSize = Math.max(200, startSize + delta);
        document.getElementById('panel-editor').style.flex = `0 0 ${newSize}px`;
        document.getElementById('panel-viewer').style.flex = '1';
      } else {
        const delta = startPos - e.clientY;
        const newSize = Math.max(80, Math.min(500, startSize + delta));
        document.getElementById('console-panel').style.height = newSize + 'px';
      }

      // Refresh editor and viewer on resize
      this.editor.refresh();
    };

    const onMouseUp = () => {
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      this.editor.refresh();
    };

    handle.addEventListener('mousedown', onMouseDown);
  }
}

// ---------- Bootstrap ----------
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
