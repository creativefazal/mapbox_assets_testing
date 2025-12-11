export function add3DBuildings(map) {
    map.on("load", () => {
        const layers = map.getStyle().layers;
        const labelLayerId = layers.find(
            (l) => l.type === "symbol" && l.layout["text-field"]
        )?.id;

        map.addLayer(
            {
                id: "3d-buildings",
                source: "composite",
                "source-layer": "building",
                filter: ["==", "extrude", "true"],
                type: "fill-extrusion",
                minzoom: 15,
                paint: {
                    "fill-extrusion-color": "#aaa",
                    "fill-extrusion-height": ["get", "height"],
                    "fill-extrusion-base": ["get", "min_height"],
                    "fill-extrusion-opacity": 0.6,
                },
            },
            labelLayerId
            
        );
        console.log('3d buildings added successfully!')
    });
}