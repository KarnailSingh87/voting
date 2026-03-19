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
    <div className="admin-queries-page max-w-6xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6 text-slate-800 dark:text-slate-100">All Raised Queries</h2>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          type="text"
          placeholder="Search by roll, name, reason, contact..."
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          className="input-field w-full sm:w-80"
        />
      </div>
      {loading ? <div className="text-center py-8 text-lg text-gray-500 dark:text-gray-400">Loading...</div> : (
        <>
          <div className="overflow-x-auto rounded-xl shadow card">
            <table className="w-full border-collapse min-w-max">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-900">
                  <th className="py-3 px-4 text-left">Roll</th>
                  <th className="py-3 px-4 text-left">Name</th>
                  <th className="py-3 px-4 text-left">IP</th>
                  <th className="py-3 px-4 text-left">Created</th>
                  <th className="py-3 px-4 text-left">View</th>
                </tr>
              </thead>
              <tbody>
                {queries.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400 dark:text-gray-500">No queries found.</td></tr>
                ) : queries.map(qr => (
                  <tr key={qr._id} className="border-b hover:bg-indigo-50 dark:hover:bg-slate-800 transition-all">
                    <td className="py-2 px-4 font-mono text-sm">{qr.roll}</td>
                    <td className="py-2 px-4">{qr.detectedName || '-'}</td>
                    <td className="py-2 px-4">{qr.reporterIp || '-'}</td>
                    <td className="py-2 px-4">{qr.createdAt ? new Date(qr.createdAt).toLocaleString() : '-'}</td>
                    <td className="py-2 px-4">
                      <button onClick={() => { setSelectedReport(qr); setShowModal(true); }} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded shadow text-sm transition-all">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

  // Show only editable fields (hide createdAt, updatedAt, contactProvided, reason)
  const allFields = [
    'roll',
    'detectedName',
    'phone',
    'userMessage',
    'reporterIp'
  ];
  const fieldsToShow = allFields
    .filter(k => !['__v','_id','createdAt','updatedAt'].includes(k))
    .map(key => [key, selectedReport[key] || '']);

  return (
    <div className="max-w-xl mx-auto p-6 bg-white dark:bg-slate-900 rounded-xl shadow-lg">
      <h3 className="mb-6 text-2xl font-bold text-slate-800 dark:text-slate-100">Full Query Information</h3>
      <table className="w-full border-separate [border-spacing:0.5rem]">
        <tbody>
          {fieldsToShow.map(([key, value]) => (
            <tr key={key}>
              <td className="font-semibold capitalize py-2 px-3 text-slate-700 dark:text-slate-200 w-40">{key.replace(/([A-Z])/g, ' $1')}</td>
              <td className="py-2 px-3">
                <input
                  value={editFields[key] !== undefined ? editFields[key] : value || ''}
                  onChange={e => handleChange(key, e.target.value)}
                  className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60"
                  disabled={saving}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <div className="text-red-600 mt-3">{error}</div>}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md shadow disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
