// ec3Building.js
// Usage: import { addEC3Building } from './ec3Building.js';
// const layer = addEC3Building(map, { meshScale: 1, buildingId: 'ec3' });

export function addEC3Building(map, opts = {}) {
  const meshScale = typeof opts.meshScale === 'number' ? opts.meshScale : 1; // visual multiplier
  const buildingId = opts.buildingId || 'ec3';
  // georeference
  const modelOrigin = opts.origin || [55.36644615299536, 25.23868429581407];
  const modelAltitude = typeof opts.altitude === 'number' ? opts.altitude : 0;
  // const modelAltitude = 0;
  const modelRotate = opts.rotate || [Math.PI / 2, 0, Math.PI / 2];

  const mercator = mapboxgl.MercatorCoordinate.fromLngLat(modelOrigin, modelAltitude);

  const customLayer = {
    id: `3d-ec3-${buildingId}`,
    type: 'custom',
    renderingMode: '3d',

    onAdd: function (_map, gl) {
      this.map = _map;

      // THREE basics
      this.scene = new THREE.Scene();

      // Mapbox custom camera (projection-only) still required for rendering:
      this.camera = new THREE.Camera();

      // Interaction camera (Perspective) — will be synced each frame
      this.raycasterCamera = new THREE.PerspectiveCamera();

      // Renderer using Mapbox GL canvas/context
      this.renderer = new THREE.WebGLRenderer({
        canvas: _map.getCanvas(),
        context: gl,
        antialias: true,
      });
      this.renderer.autoClear = false;

      // Collections & state
      this.meshes = [];                // all meshes (individual meshes)
      this.meshToBuilding = new Map();// mesh -> buildingId
      this.originalEmissive = new Map(); // mesh -> original emissive (THREE.Color)
      this.mouse = new THREE.Vector2(); // normalized coords used for screen-space math
      this.latestMouseScreen = null;    // raw screen {x,y} in pixels
      this.pendingClick = false;        // click to process during next render
      this.hoveredBuilding = null;      // currently hovered buildingId
      this.needsHoverProcess = false;   // flag set on mousemove

      // lights
      const light1 = new THREE.DirectionalLight(0xffffff, 0.9);
      light1.position.set(0, -70, 100).normalize();
      this.scene.add(light1);

      const light2 = new THREE.DirectionalLight(0xffffff, 0.6);
      light2.position.set(0, 70, 100).normalize();
      this.scene.add(light2);

      // prepare raycaster (not used for world-ray intersection here,
      // but we keep for threshold if needed)
      this.raycaster = new THREE.Raycaster();
      this.raycaster.params.Mesh.threshold = 0.01;

      // Load model
      const loader = new THREE.GLTFLoader();
      const ec3ModelUrl = './assets/models/ec3.glb';

      loader.load(
        ec3ModelUrl,
        (gltf) => {
          // Add model to scene
          this.modelRoot = gltf.scene;

          this.modelRoot.position.z = -50;
          this.modelRoot.position.set(0,0,0);

          // Compute mercator unit (version-safe)
          const mercatorUnit = typeof mercator.meterInMercatorCoordinateUnits === 'function'
            ? mercator.meterInMercatorCoordinateUnits()
            : (mercator.meterInMercatorCoordinateUnits || 1);

          // Final mesh scale: convert model units → Mercator world units, then apply visual multiplier
          const finalScale = mercatorUnit * meshScale;

          // Scale model (so mesh vertices live at correct world size)
          this.modelRoot.scale.set(finalScale, finalScale, finalScale);

          // Add to scene (we'll position via render matrix)
          this.scene.add(this.modelRoot);

          // collect meshes and tag them with buildingId
          this.modelRoot.traverse((child) => {
            if (child.isMesh) {
              // Ensure geometry has bounding data
              if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();

              this.meshes.push(child);
              this.meshToBuilding.set(child, buildingId);

              // store original emissive (if material exists)
              if (child.material && child.material.emissive) {
                this.originalEmissive.set(child, child.material.emissive.clone());
              } else if (child.material) {
                // ensure material has emissive for highlight (some materials may not)
                child.material.emissive = child.material.emissive || new THREE.Color(0x000000);
                this.originalEmissive.set(child, child.material.emissive.clone());
              }
            }
          });
        },
        undefined,
        (err) => {
          console.error('EC3 GLTF load error', err);
        }
      );

      // Mouse handlers on canvas: we record latest screen position and mark processing needed.
      const canvas = _map.getCanvas();

      const onMove = (evt) => {
        const rect = canvas.getBoundingClientRect();
        const sx = evt.clientX - rect.left;
        const sy = evt.clientY - rect.top;
        this.latestMouseScreen = { x: sx, y: sy, w: rect.width, h: rect.height };
        // normalized coords for potential use
        this.mouse.x = (sx / rect.width) * 2 - 1;
        this.mouse.y = -(sy / rect.height) * 2 + 1;
        this.needsHoverProcess = true;
      };

      const onClick = (evt) => {
        // mark click; will be processed on next render where camera is up-to-date
        const rect = canvas.getBoundingClientRect();
        const sx = evt.clientX - rect.left;
        const sy = evt.clientY - rect.top;
        this.latestMouseScreen = { x: sx, y: sy, w: rect.width, h: rect.height };
        this.mouse.x = (sx / rect.width) * 2 - 1;
        this.mouse.y = -(sy / rect.height) * 2 + 1;
        this.pendingClick = true;
        this.needsHoverProcess = true;
      };

      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('click', onClick);

      // store listeners so they can be removed if layer removed
      this._ec3_listeners = { onMove, onClick, canvas };
    },

    // Helper: project a 3D point to screen pixels using the current raycasterCamera
    projectToScreen: function (v3, canvasRect) {
      const proj = v3.clone().project(this.raycasterCamera);
      const x = (proj.x + 1) / 2 * canvasRect.width;
      const y = (-proj.y + 1) / 2 * canvasRect.height;
      return { x, y };
    },

    // Helper: check if mouse (screen coords) inside mesh's screen-space bbox
    isMouseOverMeshScreen: function (mesh, mouseScreen) {
      // update world matrix
      mesh.updateMatrixWorld(true);

      // compute bounding box in world coords (take geometry bbox and transform)
      const bbox = new THREE.Box3().setFromObject(mesh);

      // transform bbox corners to screen
      const min = bbox.min.clone().project(this.raycasterCamera);
      const max = bbox.max.clone().project(this.raycasterCamera);

      const rect = this.map.getCanvas().getBoundingClientRect();

      const xMin = (min.x + 1) / 2 * rect.width;
      const yMin = (-min.y + 1) / 2 * rect.height;
      const xMax = (max.x + 1) / 2 * rect.width;
      const yMax = (-max.y + 1) / 2 * rect.height;

      // handle degenerate boxes
      const left = Math.min(xMin, xMax);
      const right = Math.max(xMin, xMax);
      const top = Math.min(yMin, yMax);
      const bottom = Math.max(yMin, yMax);

      return mouseScreen.x >= left && mouseScreen.x <= right && mouseScreen.y >= top && mouseScreen.y <= bottom;
    },

    // highlight building (all meshes with same buildingId)
    highlightBuilding: function (id) {
      if (this.hoveredBuilding === id) return;
      // reset previous
      this.resetHighlight();

      this.hoveredBuilding = id;
      for (const mesh of this.meshes) {
        if (this.meshToBuilding.get(mesh) === id) {
          if (mesh.material && mesh.material.emissive) mesh.material.emissive.set(0x66ff66);
        }
      }
    },

    // reset highlight (restore original emissive for all meshes)
    resetHighlight: function () {
      if (!this.hoveredBuilding) return;
      for (const mesh of this.meshes) {
        if (this.originalEmissive.has(mesh)) {
          const orig = this.originalEmissive.get(mesh);
          if (mesh.material && mesh.material.emissive) mesh.material.emissive.copy(orig);
        }
      }
      this.hoveredBuilding = null;
    },

    render: function (gl, matrix) {
      // Build rotation matrices (apply any model-level rotation)
      const rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), modelRotate[0]);
      const rotationY = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), modelRotate[1]);
      const rotationZ = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 0, 1), modelRotate[2]);

      // map-provided projection matrix
      const m = new THREE.Matrix4().fromArray(matrix);

      // translation + rotation only (mesh already scaled to mercator)
      const l = new THREE.Matrix4()
        .makeTranslation(mercator.x, mercator.y, mercator.z)
        .multiply(rotationX)
        .multiply(rotationY)
        .multiply(rotationZ);

      // set camera projection used for rendering
      this.camera.projectionMatrix = m.multiply(l);

      // Sync the perspective camera used for projecting to screen
      // (copy projection and world transforms)
      this.raycasterCamera.projectionMatrix.copy(this.camera.projectionMatrix);
      // matrixWorld is not directly provided, but copying matrixWorld from camera is acceptable:
      // NOTE: camera.matrixWorld may be undefined on some versions; so use matrixWorld from camera if available.
      if (this.camera.matrixWorld) {
        this.raycasterCamera.matrixWorld.copy(this.camera.matrixWorld);
        this.raycasterCamera.matrixWorldInverse.copy(this.camera.matrixWorldInverse);
      } else {
        // fallback: set position at origin and identity matrixWorld
        this.raycasterCamera.matrixWorld.identity();
        this.raycasterCamera.matrixWorldInverse.identity();
      }

      // Render
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);

      // Process hover/click here where camera/projection is up-to-date.
      if (this.needsHoverProcess && this.latestMouseScreen && this.meshes.length > 0) {
        const screen = this.latestMouseScreen; // {x,y,w,h}
        // find which building is under mouse (first match)
        let hitBuilding = null;
        for (const mesh of this.meshes) {
          if (this.isMouseOverMeshScreen(mesh, screen)) {
            hitBuilding = this.meshToBuilding.get(mesh);
            break;
          }
        }

        if (hitBuilding) {
          this.highlightBuilding(hitBuilding);
        } else {
          this.resetHighlight();
        }

        // If a click was requested, treat it now
        if (this.pendingClick) {
          const info = document.getElementById('info');
          if (hitBuilding) {
            //   info.innerHTML = `Clicked building: ${hitBuilding}`;
              info.innerHTML = `
                <div class="animate__animated animate__fadeInUp"> <h1> You Clicked a building </h1></div>
              `;
              info.style.display = 'block';            
          } else {
            info.style.display = 'none';
          }
          this.pendingClick = false;
        }

        // Clear hover flag until next mousemove
        this.needsHoverProcess = false;
      }

      // Tell Mapbox to repaint
      this.map.triggerRepaint();
    },

    // runtime API
    setMeshScale: function (newMeshScale) {
      // rescales the modelRoot meshes (applies visual multiplier)
      if (!this.modelRoot) {
        this._pendingScale = newMeshScale;
        return;
      }
      const mercatorUnit = typeof mercator.meterInMercatorCoordinateUnits === 'function'
        ? mercator.meterInMercatorCoordinateUnits()
        : (mercator.meterInMercatorCoordinateUnits || 1);
      const final = mercatorUnit * newMeshScale;
      this.modelRoot.scale.set(final, final, final);
      this.map.triggerRepaint();
    },

    onRemove: function () {
      // remove event listeners
      if (this._ec3_listeners) {
        const { canvas, onMove, onClick } = this._ec3_listeners;
        canvas.removeEventListener('mousemove', onMove);
        canvas.removeEventListener('click', onClick);
      }
    }
  };

  // Add layer (if layer with same id exists, remove first)
  if (map.getLayer(customLayer.id)) {
    try { map.removeLayer(customLayer.id); } catch (e) {}
  }
  map.addLayer(customLayer);

  return customLayer;
}
