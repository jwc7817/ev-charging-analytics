import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [39.8283, -98.5795];
const DEFAULT_ZOOM = 4;

export default function SpatialMap({ stations = [], onSelectStation }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  // 1. Initialize Leaflet Map Instance with HTML Canvas Renderer
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Force Leaflet to use HTML5 Canvas renderer instead of DOM SVG
    const canvasRenderer = L.canvas({ padding: 0.5 });

    const map = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      renderer: canvasRenderer, // Enforces 60 FPS Canvas vector rendering
      preferCanvas: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    layerGroupRef.current = layerGroup;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Efficiently Render Canvas Markers on Stations Data Update
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;

    if (!map || !layerGroup) return;

    // Clear existing canvas layer markers
    layerGroup.clearLayers();

    if (!stations || stations.length === 0) return;

    const bounds = L.latLngBounds();
    let validPointsCount = 0;

    // Iterate points directly onto the Canvas context ( bypassing React VDOM overhead )
    stations.forEach((station) => {
      const lat = parseFloat(station.latitude);
      const lon = parseFloat(station.longitude);

      if (isNaN(lat) || isNaN(lon)) return;

      const isDCFast = station.ev_dc_fast_num > 0;
      const markerColor = isDCFast ? '#ef4444' : '#3b82f6';

      const marker = L.circleMarker([lat, lon], {
        radius: isDCFast ? 5 : 3,
        color: markerColor,
        fillColor: markerColor,
        fillOpacity: 0.75,
        weight: 1,
      });

      // // Bind interactive tooltips and click events directly to Canvas objects
      // marker.bindTooltip(`<b>${station.station_name}</b><br/>${station.state} | ${station.total_capacity_kw || 0} kW`, {
      //   direction: 'top',
      //   sticky: true,
      // });

      marker.on('click', () => {
        if (onSelectStation) {
          onSelectStation(station);
        }
      });

      layerGroup.addLayer(marker);
      bounds.extend([lat, lon]);
      validPointsCount++;
    });

    // Auto-fit map viewport bounding box if multiple stations are returned
    if (validPointsCount > 0 && stations.length < 10000) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    }
  }, [stations, onSelectStation]);

  return (
    <div 
      ref={mapRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        backgroundColor: '#0f172a',
        position: 'relative'
      }} 
    />
  );
}