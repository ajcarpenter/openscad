/**
 * viewer.js — Three.js 3D viewer for OpenSCAD Web
 *
 * Manages the 3D viewport with orbit controls, grid, axes, lighting,
 * and rendering of STL geometry.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseSTL } from './stl-parser.js';

export class Viewer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.container = canvas.parentElement;

    // Settings
    this.settings = {
      backgroundColor: options.backgroundColor || '#1a1a2e',
      modelColor: options.modelColor || '#f9a825',
      showGrid: true,
      showAxes: true,
      wireframe: false,
    };

    // Three.js setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.settings.backgroundColor);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    this.camera.position.set(50, 50, 50);
    this.camera.up.set(0, 0, 1); // OpenSCAD uses Z-up

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Orbit controls
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = true;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    // Lighting
    this._setupLighting();

    // Grid
    this.gridHelper = this._createGrid();
    this.scene.add(this.gridHelper);

    // Axes
    this.axesHelper = this._createAxes();
    this.scene.add(this.axesHelper);

    // Model group
    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);

    // Resize observer
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this.container);
    this._onResize();

    // Animation loop
    this._animating = true;
    this._animate();
  }

  // ---------- Public API ----------

  /**
   * Load an STL file (as ArrayBuffer) into the viewer.
   * @param {ArrayBuffer} stlBuffer
   */
  loadSTL(stlBuffer) {
    // Clear previous model
    this.clearModel();

    const { vertices, normals, triangleCount } = parseSTL(stlBuffer);

    if (triangleCount === 0) {
      console.warn('STL file contains no triangles');
      return;
    }

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    // Material
    const material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(this.settings.modelColor),
      specular: 0x444444,
      shininess: 30,
      side: THREE.DoubleSide,
      wireframe: this.settings.wireframe,
      flatShading: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    this.modelGroup.add(mesh);

    // Add edges for a nice outline
    const edgesMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.08,
    });
    const edges = new THREE.EdgesGeometry(geometry, 30);
    const edgeLines = new THREE.LineSegments(edges, edgesMaterial);
    this.modelGroup.add(edgeLines);

    // Fit camera to model
    this._fitToModel();

    return { triangleCount };
  }

  /**
   * Remove the current model from the scene.
   */
  clearModel() {
    while (this.modelGroup.children.length > 0) {
      const child = this.modelGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this.modelGroup.remove(child);
    }
  }

  /**
   * Reset camera to the default position.
   */
  resetCamera() {
    if (this.modelGroup.children.length > 0) {
      this._fitToModel();
    } else {
      this.camera.position.set(50, 50, 50);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  /**
   * Set camera to a top-down view.
   */
  viewTop() {
    const target = this.controls.target.clone();
    const dist = this.camera.position.distanceTo(target);
    this.camera.position.set(target.x, target.y, target.z + dist);
    this.controls.update();
  }

  /**
   * Set camera to a front view.
   */
  viewFront() {
    const target = this.controls.target.clone();
    const dist = this.camera.position.distanceTo(target);
    this.camera.position.set(target.x, target.y - dist, target.z);
    this.controls.update();
  }

  /**
   * Toggle grid visibility.
   */
  toggleGrid() {
    this.settings.showGrid = !this.settings.showGrid;
    this.gridHelper.visible = this.settings.showGrid;
    return this.settings.showGrid;
  }

  /**
   * Toggle axes visibility.
   */
  toggleAxes() {
    this.settings.showAxes = !this.settings.showAxes;
    this.axesHelper.visible = this.settings.showAxes;
    return this.settings.showAxes;
  }

  /**
   * Toggle wireframe mode.
   */
  toggleWireframe() {
    this.settings.wireframe = !this.settings.wireframe;
    this.modelGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.wireframe = this.settings.wireframe;
      }
    });
    return this.settings.wireframe;
  }

  /**
   * Update the background color.
   */
  setBackgroundColor(color) {
    this.settings.backgroundColor = color;
    this.scene.background = new THREE.Color(color);
  }

  /**
   * Update the model color.
   */
  setModelColor(color) {
    this.settings.modelColor = color;
    this.modelGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.color = new THREE.Color(color);
      }
    });
  }

  /**
   * Cleanup
   */
  dispose() {
    this._animating = false;
    this._resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.clearModel();
  }

  // ---------- Private ----------

  _setupLighting() {
    // Ambient
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    // Key light
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(50, 80, 100);
    this.scene.add(key);

    // Fill light
    const fill = new THREE.DirectionalLight(0xaabbcc, 0.3);
    fill.position.set(-50, -30, 60);
    this.scene.add(fill);

    // Rim light
    const rim = new THREE.DirectionalLight(0xccccff, 0.2);
    rim.position.set(0, -100, -50);
    this.scene.add(rim);
  }

  _createGrid() {
    const grid = new THREE.GridHelper(200, 20, 0x333355, 0x222244);
    grid.rotation.x = Math.PI / 2; // Z-up orientation
    grid.material.transparent = true;
    grid.material.opacity = 0.4;
    return grid;
  }

  _createAxes() {
    const group = new THREE.Group();

    // Axes lines
    const axisLength = 30;
    const axisColors = [0xff4444, 0x44ff44, 0x4488ff]; // X=red, Y=green, Z=blue
    const axisDirections = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];

    for (let i = 0; i < 3; i++) {
      const material = new THREE.LineBasicMaterial({ color: axisColors[i], linewidth: 2 });
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        axisDirections[i].clone().multiplyScalar(axisLength),
      ]);
      const line = new THREE.Line(geometry, material);
      group.add(line);

      // Arrowhead
      const coneGeometry = new THREE.ConeGeometry(0.5, 2, 8);
      const coneMaterial = new THREE.MeshBasicMaterial({ color: axisColors[i] });
      const cone = new THREE.Mesh(coneGeometry, coneMaterial);
      const endPos = axisDirections[i].clone().multiplyScalar(axisLength);
      cone.position.copy(endPos);
      // Orient cone along axis
      if (i === 0) cone.rotation.z = -Math.PI / 2;
      else if (i === 1) { /* default Y-up orientation */ }
      else cone.rotation.x = Math.PI / 2;
      group.add(cone);
    }

    return group;
  }

  _fitToModel() {
    const box = new THREE.Box3().setFromObject(this.modelGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraDistance = maxDim / (2 * Math.tan(fov / 2));
    cameraDistance *= 1.8; // Add some padding

    this.controls.target.copy(center);
    this.camera.position.set(
      center.x + cameraDistance * 0.5,
      center.y - cameraDistance * 0.5,
      center.z + cameraDistance * 0.4
    );
    this.camera.near = cameraDistance / 100;
    this.camera.far = cameraDistance * 100;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  _onResize() {
    const rect = this.container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  _animate() {
    if (!this._animating) return;
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
