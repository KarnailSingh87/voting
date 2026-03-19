// Editable modal for viewing and editing all details
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
                <th>IP</th>
                <th>Created</th>
                <th>View</th>
              </tr>
            </thead>
            <tbody>
              {queries.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center' }}>No queries found.</td></tr>
              ) : queries.map(qr => (
                <tr key={qr._id}>
                  <td>{qr.roll}</td>
                  <td>{qr.detectedName || '-'}</td>
                  <td>{qr.reporterIp || '-'}</td>
                  <td>{qr.createdAt ? new Date(qr.createdAt).toLocaleString() : '-'}</td>
                  <td>
                    <button onClick={() => { setSelectedReport(qr); setShowModal(true); }} style={{ padding: '4px 10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Modal open={showModal} title={selectedReport ? `All Details for: ${selectedReport.roll}` : 'Report details'} onClose={() => { setShowModal(false); setSelectedReport(null); }} confirmLabel={null}>
            {selectedReport ? (
              <EditDetailsModal selectedReport={selectedReport} setQueries={setQueries} setSelectedReport={setSelectedReport} />
            ) : null}

          </Modal>
        </>
      )}
    </div>
  );
}

export default AdminQueries;

// Editable modal for viewing and editing all details
function EditDetailsModal({ selectedReport, setQueries, setSelectedReport }) {
  const [editFields, setEditFields] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  // Helper to show phone if present, fallback to contactProvided
  const getPhone = () => selectedReport.phone || selectedReport.contactProvided || '';

  const handleChange = (key, value) => {
    setEditFields(fields => ({ ...fields, [key]: value }));
  };

  const handleSave = async () => {
    setError('');
    if (Object.keys(editFields).length === 0) {
      setError('No changes to save.');
      return;
    }
    setSaving(true);
    try {
      await axios.patch(`/api/admin/identity-reports/${selectedReport._id}`, editFields);
      setSelectedReport({ ...selectedReport, ...editFields });
      setQueries(qs => qs.map(q => q._id === selectedReport._id ? { ...q, ...editFields } : q));
      setEditFields({});
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Show all fields except 'contactProvided' and 'reason'
  const allFields = [
    'roll',
    'detectedName',
    'phone',
    'userMessage',
    'reporterIp',
    'createdAt',
    'updatedAt'
  ];
  const fieldsToShow = allFields
    .filter(k => !['__v','_id'].includes(k))
    .map(key => [key, selectedReport[key] || '']);

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 16, background: '#fff', borderRadius: 8 }}>
      <h3 style={{ marginBottom: 16, color: '#1e293b' }}>Full Query Information (Edit any field)</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {fieldsToShow.map(([key, value]) => (
            <tr key={key}>
              <td style={{ fontWeight: 600, textTransform: 'capitalize', padding: '6px 10px', color: '#334155', width: 120 }}>{key.replace(/([A-Z])/g, ' $1')}</td>
              <td style={{ padding: '6px 10px', color: '#475569' }}>
                <input
                  value={editFields[key] !== undefined ? editFields[key] : value || ''}
                  onChange={e => handleChange(key, e.target.value)}
                  style={{ width: '100%', padding: 4, border: '1px solid #cbd5e1', borderRadius: 4 }}
                  disabled={saving}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '6px 18px', background: '#10b981', color: 'white', border: 'none', borderRadius: 4, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
