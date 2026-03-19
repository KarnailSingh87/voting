import React, { useEffect, useState } from 'react';
import axios from '../../utils/axios';
import Modal from '../../components/Modal';

const AdminQueries = () => {
  const [queries, setQueries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showModal, setShowModal] = useState(false);

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
                {/* Reason column removed */}
                {/* Contact column removed */}
                <th>Phone</th>
                <th>Message</th>
                <th>IP</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {queries.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center' }}>No queries found.</td></tr>
              ) : queries.map(qr => (
                <tr key={qr._id}>
                  <td>{qr.roll}</td>
                  <td style={{ cursor: 'pointer', color: '#3b82f6', textDecoration: 'underline' }}
                      onClick={() => { setSelectedReport(qr); setShowModal(true); }}>
                    {qr.detectedName || '-'}
                  </td>
                  {/* Reason cell removed */}
                  {/* Contact cell removed */}
                  <td>{qr.phone || '-'}</td>
                  <td style={{ maxWidth: 300, whiteSpace: 'normal' }}>{qr.userMessage || qr.message || '-'}</td>
                  <td>{qr.reporterIp || '-'}</td>
                  <td>{qr.createdAt ? new Date(qr.createdAt).toLocaleString() : '-'}</td>
                    {/* View button removed. Name cell is now clickable. */}
                </tr>
              ))}
            </tbody>
          </table>

          <Modal open={showModal} title={selectedReport ? `Report: ${selectedReport.roll}` : 'Report details'} onClose={() => { setShowModal(false); setSelectedReport(null); }} confirmLabel={null}>
            {selectedReport ? (
              <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(selectedReport, null, 2)}</pre>
              </div>
            ) : null}
          </Modal>
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
