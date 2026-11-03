const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

/**
 * Generic fetch wrapper with centralized error handling and logging.
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API Error [${response.status} ${response.statusText}]: ${errorBody}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[API Client Failure] ${url}:`, error.message);
    throw error;
  }
}

/**
 * Fetches charging stations from PostGIS formatted as a GeoJSON FeatureCollection.
 * @param {Object} params - Query parameters (limit, state)
 */
export async function fetchStations({ limit = 5000, states = [] } = {}) {
  const queryParams = new URLSearchParams();
  
  if (limit) {
    queryParams.append('limit', limit);
  }
  
  // Append each selected state as a separate 'states' parameter key for FastAPI List parsing
  if (Array.isArray(states) && states.length > 0) {
    states.forEach((st) => {
      if (st) queryParams.append('states', st.toUpperCase());
    });
  }

  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const url = `${API_BASE_URL}/api/v1/stations${queryString}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API Error [${response.status}]: ${await response.text()}`);
  }

  const geojson = await response.json();

  if (geojson && geojson.features) {
    return geojson.features.map((feature) => ({
      id: feature.properties.id,
      station_name: feature.properties.station_name,
      state: feature.properties.state,
      city: feature.properties.city,
      street_address: feature.properties.street_address,
      total_capacity_kw: feature.properties.total_capacity_kw,
      ev_dc_fast_num: feature.properties.ev_dc_fast_num,
      ev_level2_evse_num: feature.properties.ev_level2_evse_num,
      access_code: feature.properties.access_code,
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1],
    }));
  }

  return [];
}

/**
 * Executes a PostGIS spatial k-NN query around a specific coordinate pair.
 */
export async function fetchKNNStations(lat, lon, k = 5) {
  return apiRequest(`/api/v1/analytics/knn?lat=${lat}&lon=${lon}&k=${k}`);
}

/**
 * Sends a natural language prompt to the Text-to-PostGIS LLM endpoint.
 */
export async function queryLLMAgent(prompt) {
  return apiRequest('/api/v1/llm/query', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}