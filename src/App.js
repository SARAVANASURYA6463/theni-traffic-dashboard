import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function App() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/nodes.csv').then(res => res.text()),
      fetch('/edges.csv').then(res => res.text())
    ]).then(async ([nodesText, edgesText]) => {

      // parse nodes
      const nodeRows = nodesText.trim().split('\n').slice(1);
      const nodeList = nodeRows.map(row => {
        const [node_id, lon, lat] = row.split(',');
        return { node_id: parseInt(node_id), lon: parseFloat(lon), lat: parseFloat(lat) };
      });
      const nodeMap = {};
      nodeList.forEach(n => { nodeMap[n.node_id] = n; });
      setNodes(nodeList);

      // parse edges (handle quoted road names that may contain commas)
      const edgeRows = edgesText.trim().split('\n').slice(1);
      const edgeList = edgeRows.map(row => {
        const parts = row.split(',');
        const edge_id = parseInt(parts[0]);
        const source_node = parseInt(parts[1]);
        const target_node = parseInt(parts[2]);
        const highway_type = parts[3];
        return { edge_id, source_node, target_node, highway_type };
      }).filter(e => nodeMap[e.source_node] && nodeMap[e.target_node]);
      setEdges(edgeList);

      // fetch predictions for each edge (not node this time — edges are the actual roads)
      const results = {};
      await Promise.all(
        edgeList.map(edge =>
          fetch(`https://theni-traffic-api.onrender.com/predict/${edge.edge_id}`)
            .then(res => res.json())
            .then(data => {
              if (data.predicted_speed_kmh !== undefined) {
                results[edge.edge_id] = data.predicted_speed_kmh;
              }
            })
            .catch(() => {})
        )
      );
      setPredictions(results);
      setLoading(false);
    });
  }, []);

  const getColor = (speed) => {
    if (speed === undefined) return '#808080';
    if (speed < 15) return '#e60000';
    if (speed < 30) return '#ff9900';
    return '#00b300';
  };

  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.node_id] = n; });

  // summary stats
  const speeds = Object.values(predictions);
  const avgSpeed = speeds.length ? (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1) : '—';
  const congestedCount = speeds.filter(s => s < 15).length;
  const congestedPct = speeds.length ? ((congestedCount / speeds.length) * 100).toFixed(0) : '—';

  return (
    <div>
      {loading && (
        <div style={{position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'white', padding: '8px 14px', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.3)'}}>
          Loading predictions...
        </div>
      )}

      {!loading && (
        <div style={{position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'white', padding: '12px 16px', borderRadius: 6, boxShadow: '0 1px 6px rgba(0,0,0,0.3)', fontFamily: 'sans-serif', fontSize: 14}}>
          <b>Theni Traffic Dashboard</b>
          <div style={{marginTop: 6}}>Avg predicted speed: <b>{avgSpeed} km/h</b></div>
          <div>Congested roads: <b>{congestedCount}</b> ({congestedPct}%)</div>
        </div>
      )}

      {/* Legend */}
      <div style={{position: 'absolute', bottom: 20, left: 10, zIndex: 1000, background: 'white', padding: '10px 14px', borderRadius: 6, boxShadow: '0 1px 6px rgba(0,0,0,0.3)', fontFamily: 'sans-serif', fontSize: 13}}>
        <b>Predicted Speed</b>
        <div style={{marginTop: 6}}><span style={{display:'inline-block', width:14, height:14, background:'#00b300', marginRight:6, borderRadius:'50%'}}></span>Clear (30+ km/h)</div>
        <div><span style={{display:'inline-block', width:14, height:14, background:'#ff9900', marginRight:6, borderRadius:'50%'}}></span>Moderate (15–30 km/h)</div>
        <div><span style={{display:'inline-block', width:14, height:14, background:'#e60000', marginRight:6, borderRadius:'50%'}}></span>Congested (below 15 km/h)</div>
      </div>

      <MapContainer center={[10.0, 77.48]} zoom={14} style={{ height: '100vh', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {edges.map(edge => {
          const src = nodeMap[edge.source_node];
          const tgt = nodeMap[edge.target_node];
          const speed = predictions[edge.edge_id];
          const color = getColor(speed);
          return (
            <Polyline
              key={edge.edge_id}
              positions={[[src.lat, src.lon], [tgt.lat, tgt.lon]]}
              pathOptions={{ color: color, weight: 4, opacity: 0.8 }}
            >
              <Popup>
                Road ID: {edge.edge_id}<br />
                Type: {edge.highway_type}<br />
                Predicted speed: {speed !== undefined ? `${speed} km/h` : 'N/A'}
              </Popup>
            </Polyline>
          );
        })}
      </MapContainer>
    </div>
  );
}

export default App;