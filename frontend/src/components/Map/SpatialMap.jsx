import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [39.8283, -98.5795]; // Geographical center of continental US
const DEFAULT_ZOOM = 4;

export default function SpatialMap({ stations = [], onSelectStation }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '500px' }}>
      <MapContainer 
        center={DEFAULT_CENTER} 
        zoom={DEFAULT_ZOOM} 
        style={{ width: '100%', height: '100%', minHeight: '500px', backgroundColor: '#1e293b' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {stations && stations.map((station) => {
          const lat = parseFloat(station.latitude);
          const lon = parseFloat(station.longitude);

          if (isNaN(lat) || isNaN(lon)) return null;

        //   const isDCFast = station.ev_dc_fast_num > 0;
        //   const markerColor = isDCFast ? '#ef4444' : '#3b82f6';
          const markerColor = '#3b82f6';

          return (
            <CircleMarker
              key={station.id}
              center={[lat, lon]}
            //   radius={isDCFast ? 6 : 4}
              radius={4}
              pathOptions={{
                color: markerColor,
                fillColor: markerColor,
                fillOpacity: 0.8,
                weight: 1,
              }}
              eventHandlers={{
                click: () => onSelectStation && onSelectStation(station),
              }}
            >
              <Tooltip sticky>{station.station_name}</Tooltip>
              <Popup>
                <div style={{ fontFamily: 'sans-serif', fontSize: '13px', color: '#1e293b' }}>
                  <h4 style={{ margin: '0 0 6px 0' }}>{station.station_name}</h4>
                  <p style={{ margin: '2px 0' }}><strong>State:</strong> {station.state}</p>
                  <p style={{ margin: '2px 0' }}><strong>Total Power:</strong> {station.total_capacity_kw || 0} kW</p>
                  <p style={{ margin: '2px 0' }}><strong>DC Fast Ports:</strong> {station.ev_dc_fast_num || 0}</p>
                  <p style={{ margin: '2px 0' }}><strong>Level 2 Ports:</strong> {station.ev_level2_evse_num || 0}</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}