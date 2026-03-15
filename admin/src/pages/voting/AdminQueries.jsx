import React, { useEffect, useState } from 'react';
import axios from '../../utils/axios';

const AdminQueries = () => {
  const [queries, setQueries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  useEffect(() => {
    setLoading(true);
  axios.get(`/api/admin/identity-reports?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`)
      .then(res => {
        setQueries(res.data.items || []);
        setTotal(res.data.total || 0);
      })
      .finally(() => setLoading(false));
  }, [q, page, limit]);

  return (
    <div className="admin-queries-page" style={{ padding: 24 }}>
      <h2>All Raised Queries</h2>
      <div style={{ margin: '16px 0' }}>
        <input
          type="text"
          placeholder="Search by roll, name, reason, contact..."
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          style={{ padding: 8, width: 300 }}
        />
      </div>
      {loading ? <div>Loading...</div> : (
        <>
          <table className="queries-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Roll</th>
                <th>Name</th>
                <th>Reason</th>
                <th>Contact</th>
                <th>IP</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {queries.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center' }}>No queries found.</td></tr>
              ) : queries.map(qr => (
                <tr key={qr._id}>
                  <td>{qr.roll}</td>
                  <td>{qr.detectedName || '-'}</td>
                  <td>{qr.reason || '-'}</td>
                  <td>{qr.contactProvided || '-'}</td>
                  <td>{qr.reporterIp || '-'}</td>
                  <td>{qr.createdAt ? new Date(qr.createdAt).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16 }}>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span style={{ margin: '0 12px' }}>Page {page} / {Math.ceil(total / limit) || 1}</span>
            <button disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminQueries;
