import { createMap } from "./map-config.js";
import { add3DBuildings } from "./add-3d-buildings.js"
import { addDoubleClickTransition, switchMapStyle } from "./map-events.js";
import { addEC3Building } from "./ec3Building.js";

// import { loadModel } from "./model-loader.js";

// import { setupClickHandler } from "./click-handler.js";
// import { createThreeLayer } from "./three-layer.js";
    
const map = createMap();


// Add 3D buildings when map is ready
map.on("load", () => {

    add3DBuildings(map);
    addEC3Building(map, { meshScale: 1, buildingId: 'ec3' });
    
});

// Make 3D function globally available for style reload
// window.add3DBuildings = add3DBuildings(map);
window.add3DBuildings = add3DBuildings;
window.addEC3Building = addEC3Building;

//double click function
addDoubleClickTransition(map);
