export function addDoubleClickTransition(map) {
    // Disable default zoom on double-click
    map.doubleClickZoom.disable();

    let mapSwitched = false; // ← track if map has already changed

    map.on("dblclick", (e) => {
        console.log("Double click at:", e.lngLat);

        // Smooth fly animation
        map.flyTo({
            center: [e.lngLat.lng, e.lngLat.lat],
            zoom: 18,
            speed: 0.6,        // lower = smoother
            curve: 1.8,        // animation curvature
            pitch: 70,
            bearing: map.getBearing() + 20,
            essential: true
        });

        // Show loader immediately
        const loader = document.getElementById("loader");
        


        // When animation ends → change style ONCE
        map.once("moveend", () => {
            if(!mapSwitched) {
                console.log("First Double Clicked");

                switchMapStyle(map, "mapbox://styles/mapbox/standard");

                loader.classList.remove("hidden");
                loader.classList.add("visible");

                mapSwitched = true;
            } else {
                // Delay hiding by 1.5 second
                setTimeout(() => {
                    loader.classList.remove("visible");
                    loader.classList.add("hidden");
                }, 1500); // 1000 ms = 1 second
            }
            
        });

    });
}
// const newStyle = "mapbox://styles/mapbox/standard";

export function switchMapStyle(map, newStyle) {
    // Show loader immediately
    const loader = document.getElementById("loader");

    map.setStyle(newStyle);


    // Make sure 3D buildings or other layers reload after style change
    map.once("styledata", () => {         
        console.log("Style changed to:", newStyle);
        
        if (window.add3DBuildings) {
            window.add3DBuildings(map); // global safe hook
            window.addEC3Building(map,{ meshScale: 1, buildingId: 'ec3' } ); // global safe hook
        }

        // Delay hiding by 1.5 second
        setTimeout(() => {
            loader.classList.remove("visible");
            loader.classList.add("hidden");
        }, 1500); // 1000 ms = 1 second
    });
}


 