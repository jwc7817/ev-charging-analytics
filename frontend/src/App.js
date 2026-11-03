import React, { useState, useEffect, useCallback } from 'react';
import SpatialMap from './components/Map/SpatialMap';
import { fetchStations } from './api/client';

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC'
];

const LIMIT_OPTIONS = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

export default function App() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedStation, setSelectedStation] = useState(null);

  // 1. Pending Form Inputs State (UI controls)
  const [pendingStates, setPendingStates] = useState(['CA', 'NY']);
  const [pendingLimit, setPendingLimit] = useState(2500);

  // 2. Active Query State (Triggered ONLY via "Apply Filters" button)
  const [activeQueryParams, setActiveQueryParams] = useState({
    states: ['CA', 'NY'],
    limit: 2500,
  });

  // Fetch stations strictly based on activeQueryParams
  const loadStations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStations({
        limit: activeQueryParams.limit,
        states: activeQueryParams.states,
      });
      setStations(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch stations from PostGIS API');
    } finally {
      setLoading(false);
    }
  }, [activeQueryParams]);

  // Execute API fetch ONLY when activeQueryParams updates
  useEffect(() => {
    loadStations();
  }, [loadStations]);

  // Handler for Checkbox Toggles (Modifies local pending state only)
  const handleStateCheckboxChange = (stateCode) => {
    setPendingStates((prev) =>
      prev.includes(stateCode)
        ? prev.filter((s) => s !== stateCode)
        : [...prev, stateCode]
    );
  };

  // Helper functions for Select All / Clear All
  const handleSelectAllStates = () => setPendingStates([...US_STATES]);
  const handleClearAllStates = () => setPendingStates([]);

  // Apply Button Click Handler (Promotes pending UI inputs to active query state)
  const handleApplyFilters = () => {
    setActiveQueryParams({
      states: pendingStates,
      limit: pendingLimit,
    });
  };

  // Check if form has unapplied changes
  const hasUnappliedChanges =
    JSON.stringify(pendingStates.sort()) !== JSON.stringify(activeQueryParams.states.sort()) ||
    pendingLimit !== activeQueryParams.limit;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <header style={{ background: '#0f172a', color: '#f8fafc', padding: '12px 24px', borderBottom: '1px solid #334155' }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>EV Infrastructure Accessibility Analytics</h2>
      </header>

      <div style={{ display: 'flex', flex: 1, height: 'calc(100vh - 53px)', width: '100%' }}>
        {/* Sidebar Controls */}
        <div style={{ width: '320px', background: '#1e293b', color: '#f8fafc', padding: '16px', borderRight: '1px solid #334155', overflowY: 'auto' }}>
          <h3 style={{ marginTop: 0, fontSize: '16px', color: '#38bdf8' }}>Filter Controls</h3>

          {/* Limit Selector */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold' }}>
              Response Limit:
            </label>
            <select
              value={pendingLimit}
              onChange={(e) => setPendingLimit(Number(e.target.value))}
              style={{ width: '100%', padding: '6px', borderRadius: '4px', background: '#0f172a', color: '#fff', border: '1px solid #475569' }}
            >
              {LIMIT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt.toLocaleString()} stations
                </option>
              ))}
            </select>
          </div>

          {/* Multi-State Checkbox List */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Filter by States:</label>
              <div>
                <button
                  type="button"
                  onClick={handleSelectAllStates}
                  style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '11px', cursor: 'pointer', padding: '0 4px' }}
                >
                  All
                </button>
                <span style={{ fontSize: '11px', color: '#475569' }}>|</span>
                <button
                  type="button"
                  onClick={handleClearAllStates}
                  style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '11px', cursor: 'pointer', padding: '0 4px' }}
                >
                  None
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', maxHeight: '180px', overflowY: 'auto', background: '#0f172a', padding: '8px', borderRadius: '4px', border: '1px solid #475569' }}>
              {US_STATES.map((st) => (
                <label key={st} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={pendingStates.includes(st)}
                    onChange={() => handleStateCheckboxChange(st)}
                    style={{ marginRight: '6px' }}
                  />
                  {st}
                </label>
              ))}
            </div>
            <small style={{ color: '#94a3b8', fontSize: '11px', display: 'block', marginTop: '4px' }}>
              {pendingStates.length === 0 ? 'All US States Selected' : `Selected: ${pendingStates.length} state(s)`}
            </small>
          </div>

          {/* Explicit Apply Filters Button */}
          <button
            type="button"
            onClick={handleApplyFilters}
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: 'none',
              background: hasUnappliedChanges ? '#2563eb' : '#334155',
              color: '#ffffff',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s ease-in-out',
            }}
          >
            {loading ? 'Executing Query...' : hasUnappliedChanges ? 'Apply Filters ➔' : 'Filters Active'}
          </button>

          <hr style={{ borderColor: '#334155', margin: '16px 0' }} />

          {/* Active Data Metrics */}
          <p style={{ fontSize: '14px' }}><strong>Rendered Points:</strong> {stations.length.toLocaleString()}</p>
          {loading && <p style={{ color: '#fbbf24', fontSize: '13px' }}>⏳ Executing PostGIS spatial query...</p>}
          {error && <p style={{ color: '#f87171', fontSize: '12px' }}>{error}</p>}

          {selectedStation && (
            <div style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', marginTop: '16px', border: '1px solid #334155' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>Selected Station</h4>
              <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Name:</strong> {selectedStation.station_name}</p>
              <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>State:</strong> {selectedStation.state}</p>
              <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Capacity:</strong> {selectedStation.total_capacity_kw} kW</p>
            </div>
          )}
        </div>

        {/* GIS Map Viewport */}
        <div style={{ flex: 1, height: '100%', width: '100%', position: 'relative' }}>
          <SpatialMap stations={stations} onSelectStation={setSelectedStation} />
        </div>
      </div>
    </div>
  );
}