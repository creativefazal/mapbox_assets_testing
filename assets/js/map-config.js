export const MAP_TOKEN = 'pk.eyJ1IjoiYXNtaGlqYXMiLCJhIjoiY2p5bHJpbHhkMDcxaDNtcWZ3MzFmcDFyZSJ9.eZsYog9ljgNt3UN8R9C0gw';

export function createMap() {
    mapboxgl.accessToken = MAP_TOKEN;
    
    const map = new mapboxgl.Map({
        container: "map",
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [55.36644615299536, 25.23868429581407],
        zoom: 16,
        pitch: 0,
        bearing: 20,
        antialias: true
    })
    return  map;
}
