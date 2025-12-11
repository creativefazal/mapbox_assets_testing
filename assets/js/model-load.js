// model-loader.js
export let clickableMeshes = [];

export function loadModel(scene, map) {
  const loader = new THREE.GLTFLoader();

  const origin = [55.35651434815996, 25.234269251701356];
  const merc = mapboxgl.MercatorCoordinate.fromLngLat(origin, 0);
  const scale = merc.meterInMercatorCoordinateUnits() * 20;

  loader.load(
    "https://docs.mapbox.com/mapbox-gl-js/assets/34M_17/34M_17.gltf",
    (gltf) => {
      const model = gltf.scene;
      model.position.set(merc.x, merc.y, merc.z);
      model.scale.set(scale, scale, scale);

      model.traverse((child) => {
        if (child.isMesh) clickableMeshes.push(child);
      });

      scene.add(model);
      console.log("Model loaded.");
    }
  );
}