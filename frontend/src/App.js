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

const LIMIT_OPTIONS = [1000, 2500, 5000, 10000, 25000, 50000, 100000];

export default function App() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedStation, setSelectedStation] = useState(null);

  // 1. Pending vs. Active Form Filter State
  const [pendingStates, setPendingStates] = useState(['CA']);
  const [pendingLimit, setPendingLimit] = useState(2500);
  const [activeQueryParams, setActiveQueryParams] = useState({
    states: ['CA'],
    limit: 2500,
  });

  // 2. LLM Text-to-PostGIS State
  const [nlPrompt, setNlPrompt] = useState('');
  const [nlLoading, setNlLoading] = useState(false);
  const [llmExplanation, setLlmExplanation] = useState('');
  const [generatedSql, setGeneratedSql] = useState('');
  const [activeQueryType, setActiveQueryType] = useState('FILTER'); // 'FILTER' | 'LLM'
  const [aggregateData, setAggregateData] = useState(null);

  // Structured Bounding-Box/State PostGIS API Fetch
  const loadStations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStations({
        limit: activeQueryParams.limit,
        states: activeQueryParams.states,
      });
      setStations(data);
      setActiveQueryType('FILTER');
      setLlmExplanation('');
      setGeneratedSql('');
      setAggregateData(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch stations from PostGIS API');
    } finally {
      setLoading(false);
    }
  }, [activeQueryParams]);

  useEffect(() => {
    loadStations();
  }, [loadStations]);

  // Handle Natural Language Prompt Submission to FastAPI Gemini Service
  const handleNlQuerySubmit = async (e) => {
    e.preventDefault();
    if (!nlPrompt.trim()) return;

    setNlLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/api/v1/llm/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: nlPrompt }),
      });

      if (!response.ok) {
        const errDetail = await response.json();
        throw new Error(errDetail.detail || 'LLM Spatial Translation failed.');
      }

      const result = await response.json();

      setLlmExplanation(result.explanation || '');
      setGeneratedSql(result.generated_sql || '');
      setActiveQueryType('LLM');

      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        // Inspect row attributes to differentiate Point Spatial vs. Tabular Scalar
        const firstRow = result.data[0];
        const hasPointGeometry =
          ('latitude' in firstRow && 'longitude' in firstRow) ||
          'geom' in firstRow ||
          ('lat' in firstRow && 'lon' in firstRow);

        if (hasPointGeometry) {
          // Outcome 1: Render Points Directly on Canvas Map
          setStations(result.data);
          setAggregateData(null);
        } else {
          // Outcome 2: Render Aggregate Tabular Metrics in Sidebar
          setAggregateData(result.data);
        }
      } else {
        setError('LLM query executed successfully, but returned 0 records.');
      }
    } catch (err) {
      setError(err.message || 'Failed to process natural language query.');
    } finally {
      setNlLoading(false);
    }
  };

  // Structured UI Filter Controls
  const handleStateCheckboxChange = (stateCode) => {
    setPendingStates((prev) =>
      prev.includes(stateCode)
        ? prev.filter((s) => s !== stateCode)
        : [...prev, stateCode]
    );
  };

  const handleSelectAllStates = () => setPendingStates([...US_STATES]);
  const handleClearAllStates = () => setPendingStates([]);

  const handleApplyFilters = () => {
    setActiveQueryParams({
      states: pendingStates,
      limit: pendingLimit,
    });
  };

  const hasUnappliedChanges =
    JSON.stringify(pendingStates.sort()) !== JSON.stringify(activeQueryParams.states.sort()) ||
    pendingLimit !== activeQueryParams.limit;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Header Bar */}
      <header style={{ background: '#0f172a', color: '#f8fafc', padding: '12px 24px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
          EV Infrastructure Accessibility Analytics Dashboard
        </h2>
        {/* <span style={{ fontSize: '12px', background: '#1e293b', padding: '4px 10px', borderRadius: '12px', border: '1px solid #475569', color: '#38bdf8' }}>
          PostGIS 3.4 + Gemini 2.5 + Canvas Renderer
        </span> */}
      </header>

      <div style={{ display: 'flex', flex: 1, height: 'calc(100vh - 53px)', width: '100%' }}>
        {/* Sidebar Controls */}
        <div style={{ width: '360px', background: '#1e293b', color: '#f8fafc', padding: '16px', borderRight: '1px solid #334155', overflowY: 'auto' }}>
          
          {/* AI Text-to-PostGIS Search Card */}
          <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #0284c7', marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Natural Language Search
            </h3>
            <form onSubmit={handleNlQuerySubmit}>
              <input
                type="text"
                placeholder="e.g. Top 20 DC fast chargers in CA with capacity > 100kW"
                value={nlPrompt}
                onChange={(e) => setNlPrompt(e.target.value)}
                style={{
                  width: '93%',
                  padding: '8px',
                  borderRadius: '4px',
                  background: '#1e293b',
                  color: '#ffffff',
                  border: '1px solid #475569',
                  fontSize: '12px',
                  marginBottom: '8px',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={nlLoading || !nlPrompt.trim()}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  background: nlLoading ? '#334155' : '#0284c7',
                  color: '#ffffff',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  border: 'none',
                  cursor: nlLoading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                {nlLoading ? 'Translating to PostGIS SQL...' : 'Run Natural Language Query ➔'}
              </button>
            </form>

            {/* AI Explanation & Generated SQL Output */}
            {activeQueryType === 'LLM' && llmExplanation && (
              <div style={{ marginTop: '10px', padding: '8px', background: '#1e293b', borderRadius: '4px', borderLeft: '3px solid #38bdf8' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#e2e8f0' }}>
                  💡 <strong>Query Logic:</strong> {llmExplanation}
                </p>
                {generatedSql && (
                  <pre style={{ margin: 0, fontSize: '10px', background: '#090d16', padding: '6px', borderRadius: '3px', color: '#34d399', overflowX: 'auto' }}>
                    {generatedSql}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Aggregate Tabular Result Panel (For Non-Point Queries) */}
          {aggregateData && (
            <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #34d399', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#34d399', fontSize: '13px' }}>📊 Aggregate Query Metrics</h4>
              <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', color: '#e2e8f0' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left' }}>
                      {Object.keys(aggregateData[0]).map((key) => (
                        <th key={key} style={{ padding: '4px' }}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aggregateData.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                        {Object.values(row).map((val, i) => (
                          <td key={i} style={{ padding: '4px' }}>{String(val)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0' }}>
            <div style={{ flex: 1, height: '1px', background: '#334155' }}></div>
            <span style={{ padding: '0 8px', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>OR Structured Controls</span>
            <div style={{ flex: 1, height: '1px', background: '#334155' }}></div>
          </div>

          {/* Response Limit Dropdown */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 'bold', color: '#cbd5e1' }}>
              Response Point Limit:
            </label>
            <select
              value={pendingLimit}
              onChange={(e) => setPendingLimit(Number(e.target.value))}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#0f172a', color: '#fff', border: '1px solid #475569', fontSize: '12px' }}
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
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#cbd5e1' }}>Filter by State:</label>
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
                  Clear
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', maxHeight: '140px', overflowY: 'auto', background: '#0f172a', padding: '8px', borderRadius: '4px', border: '1px solid #475569' }}>
              {US_STATES.map((st) => (
                <label key={st} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#e2e8f0' }}>
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
              fontSize: '13px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s ease-in-out',
              marginBottom: '16px'
            }}
          >
            {loading ? 'Executing Query...' : hasUnappliedChanges ? 'Apply Structured Filters ➔' : 'Structured Filters Active'}
          </button>

          <hr style={{ borderColor: '#334155', margin: '16px 0' }} />

          {/* Active Status & Selected Feature */}
          <div style={{ fontSize: '13px' }}>
            <p style={{ margin: '4px 0' }}>
              <strong>Query Mode:</strong>{' '}
              <span style={{ color: activeQueryType === 'LLM' ? '#38bdf8' : '#34d399', fontWeight: 'bold' }}>
                {activeQueryType === 'LLM' ? 'Gemini Text-to-PostGIS' : 'Structured Spatial Query'}
              </span>
            </p>
            <p style={{ margin: '4px 0' }}>
              <strong>Rendered Canvas Points:</strong> {stations.length.toLocaleString()}
            </p>
          </div>

          {loading && <p style={{ color: '#fbbf24', fontSize: '12px', marginTop: '8px' }}>⏳ Executing PostGIS Spatial Query...</p>}
          {error && <p style={{ color: '#f87171', fontSize: '12px', marginTop: '8px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '4px', border: '1px solid #ef4444' }}>{error}</p>}

          {/* Inspector Card on Canvas Marker Click */}
          {selectedStation && (
            <div style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', marginTop: '16px', border: '1px solid #334155' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#38bdf8', fontSize: '13px' }}>Selected Station Feature</h4>
              <p style={{ margin: '4px 0', fontSize: '12px' }}><strong>Name:</strong> {selectedStation.station_name}</p>
              <p style={{ margin: '4px 0', fontSize: '12px' }}><strong>State:</strong> {selectedStation.state}</p>
              <p style={{ margin: '4px 0', fontSize: '12px' }}><strong>Total Power:</strong> {selectedStation.total_capacity_kw || 0} kW</p>
              <p style={{ margin: '4px 0', fontSize: '12px' }}><strong>DC Fast Ports:</strong> {selectedStation.ev_dc_fast_num || 0}</p>
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