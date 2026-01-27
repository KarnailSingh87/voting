/* global Set, Promise */
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import axios from '../../utils/axios';
import Modal from '../../components/Modal';

const AdminVoters = () => {
  const [q, setQ] = useState('');
  const [elections, setElections] = useState([]);
  const [selectedElection, setSelectedElection] = useState('');
  const [, setBackendHealthy] = useState(true);
  const debounceRef = useRef(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true); setError('');
    // ensure backend reachable before attempting heavy fetch
    try {
      await axios.get('/health');
      setBackendHealthy(true);
    } catch (he) {
      setBackendHealthy(false);
      setError(`Network error: could not reach backend at ${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005'}`);
      setLoading(false);
      return;
    }
    try {
      const params = { q, page, limit: 50 };
      if (selectedElection) params.electionId = selectedElection;
      const res = await axios.get('/api/admin/students', { params });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      if (!e.response) {
        setBackendHealthy(false);
        setError(`Network error: could not reach backend at ${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005'}`);
      } else {
        setError(e.response?.data?.message || e.message || 'Failed to fetch');
      }
    } finally { setLoading(false); }
  }, [q, page, selectedElection]);

  useEffect(() => { fetch(); }, [fetch, page, selectedElection]);

  // debounce search input for smoother UX
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetch();
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, fetch]);

  // Preselect electionId from URL query (optional) so links can open AdminVoters filtered
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const eid = params.get('electionId');
      if (eid) setSelectedElection(eid);
    } catch (err) { /* ignore in non-browser env */ }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await axios.get('/health'); // quick health probe
        const res = await axios.get('/api/admin/election');
        if (res.data && mounted) setElections(res.data.elections || []);
      } catch (e) { setBackendHealthy(false); /* ignore elections load failure silently */ }
    })();
    return () => { mounted = false; };
  }, []);

  const toggleVoted = async (roll, voted) => {
    try {
      await axios.patch(`/api/admin/students/${encodeURIComponent(roll)}`, { voted: !!voted });
      fetch();
    } catch (e) { setError(e.response?.data?.message || e.message); }
  };

  const toggleSelected = (roll) => {
    setSelected(s => {
      const ns = new Set(Array.from(s));
      if (ns.has(roll)) ns.delete(roll); else ns.add(roll);
      return ns;
    });
  };

  const bulkUpdate = async (voted) => {
    if (selected.size === 0) return;
    try {
      const promises = Array.from(selected).map(r => axios.patch(`/api/admin/students/${encodeURIComponent(r)}`, { voted }));
      await Promise.all(promises);
      setSelected(new Set());
      fetch();
    } catch (e) { setError(e.response?.data?.message || e.message); }
  };

  const exportSelected = () => {
    const rows = items.filter(i => selected.has(i.roll)).map(i => `${i.roll},"${i.name}",${i.email || ''},${i.mobile || ''}`);
    if (rows.length === 0) return;
    const csv = 'roll,name,email,mobile\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'voters_export.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const remove = async (roll) => {
    // open confirm modal
    setDeleteTarget(roll);
    setShowDeleteModal(true);
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const confirmDelete = async () => {
    const roll = deleteTarget;
    setShowDeleteModal(false);
    setDeleteTarget(null);
    if (!roll) return;
    try { await axios.delete(`/api/admin/students/${encodeURIComponent(roll)}`); toast.success('Deleted'); fetch(); } catch (e) { const msg = e.response?.data?.message || e.message; setError(msg); toast.error(msg); }
  };

  const removeSelected = () => {
    if (selected.size === 0) return;
    setShowBulkDeleteModal(true);
  };

  const confirmBulkDelete = async () => {
    setShowBulkDeleteModal(false);
    const rolls = Array.from(selected);
    if (rolls.length === 0) return;
    try {
      const res = await axios.post('/api/admin/students/bulk-delete', { rolls });
      const deleted = res.data?.deleted ?? 0;
      toast.success(`Deleted ${deleted} voter(s)`);
      setSelected(new Set());
      fetch();
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      setError(msg);
      toast.error(msg);
    }
  };

  const openEdit = (student) => setEditing({ ...student });
  const closeEdit = () => setEditing(null);
  const saveEdit = async () => {
    if (!editing) return;
    // client-side validation
    const errs = {};
    if (!editing.name || editing.name.trim().length < 2) errs.name = 'Name is required';
    const email = (editing.email || '').trim();
    if (email) {
      // simple email regex
      const re = /^\S+@\S+\.\S+$/;
      if (!re.test(email)) errs.email = 'Invalid email';
    }
    const mobile = (editing.mobile || '').trim();
    if (mobile) {
      const mre = /^\+?\d{7,15}$/;
      if (!mre.test(mobile)) errs.mobile = 'Invalid phone number';
    }
    if (Object.keys(errs).length > 0) {
      setError(Object.values(errs).join(' — '));
      // attach field-level errors to editing object for inline display
      setEditing(e => ({ ...e, __errs: errs }));
      return;
    }

    try {
      await axios.patch(`/api/admin/students/${encodeURIComponent(editing.roll)}`, { name: editing.name, email: editing.email, mobile: editing.mobile });
      toast.success('Saved');
      closeEdit(); fetch();
    } catch (e) { const msg = e.response?.data?.message || e.message; setError(msg); toast.error(msg); }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-5xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Registered Voters</h2>
      <div className="mb-4 flex items-center space-x-2">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by roll, name or email" className="px-3 py-2 border rounded w-full" />
        <select value={selectedElection} onChange={e=>{ setSelectedElection(e.target.value); setPage(1); }} className="px-3 py-2 border rounded">
          <option value="">All elections</option>
          {elections.map(ev => <option key={ev._id} value={ev._id}>{ev.title}</option>)}
        </select>
        <button onClick={()=>{ setPage(1); fetch(); }} className="px-3 py-2 bg-cyan-600 text-white rounded">Search</button>
      </div>

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => bulkUpdate(true)} className="px-3 py-1 bg-blue-600 text-white rounded">Mark Selected Voted</button>
        <button onClick={() => bulkUpdate(false)} className="px-3 py-1 bg-gray-200 rounded">Unmark Selected</button>
        <button onClick={exportSelected} className="px-3 py-1 bg-green-600 text-white rounded">Export Selected</button>
        <button onClick={removeSelected} className="px-3 py-1 bg-red-600 text-white rounded">Delete Selected</button>
      </div>
      {loading ? <div>Loading...</div> : (
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2"><input type="checkbox" onChange={(e)=>{ if(e.target.checked) setSelected(new Set(items.map(i=>i.roll))); else setSelected(new Set()); }} checked={items.length>0 && selected.size===items.length} /></th>
              <th className="py-2">Roll</th>
              <th className="py-2">Name</th>
              <th className="py-2">Scope</th>
              <th className="py-2">Email</th>
              <th className="py-2">Mobile</th>
              <th className="py-2">Voted</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s._id} className="border-b">
                <td className="py-2"><input type="checkbox" checked={selected.has(s.roll)} onChange={()=>toggleSelected(s.roll)} /></td>
                <td className="py-2">{s.roll}</td>
                <td className="py-2">{s.name}</td>
                <td className="py-2">
                  {s.masterList ? (
                    <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs">Master</span>
                  ) : (s.elections && s.elections.length > 0 ? (
                    <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">{s.elections.length} election(s)</span>
                  ) : (
                    <span className="text-sm text-gray-500">—</span>
                  ))}
                </td>
                <td className="py-2">{s.email}</td>
                <td className="py-2">{s.mobile}</td>
                <td className="py-2">{s.voted ? 'Yes' : 'No'}</td>
                <td className="py-2">
                  <button onClick={()=>toggleVoted(s.roll, !s.voted)} className="mr-2 px-2 py-1 bg-blue-600 text-white rounded">{s.voted ? 'Unmark' : 'Mark Voted'}</button>
                  <button onClick={()=>openEdit(s)} className="mr-2 px-2 py-1 bg-yellow-500 text-white rounded">Edit</button>
                  <button onClick={()=>remove(s.roll)} className="px-2 py-1 bg-red-600 text-white rounded">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Inline edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-lg w-96">
            <h3 className="text-lg font-medium mb-3">Edit Voter {editing.roll}</h3>
            <div className="space-y-2">
              <div>
                <label className="block text-sm text-gray-600">Name</label>
                <input value={editing.name} onChange={e=>setEditing(s=>({...s, name: e.target.value}))} className="w-full px-3 py-2 border rounded" />
                {editing.__errs?.name && <div className="text-xs text-red-600 mt-1">{editing.__errs.name}</div>}
              </div>
              <div>
                <label className="block text-sm text-gray-600">Email</label>
                <input value={editing.email} onChange={e=>setEditing(s=>({...s, email: e.target.value}))} className="w-full px-3 py-2 border rounded" />
                {editing.__errs?.email && <div className="text-xs text-red-600 mt-1">{editing.__errs.email}</div>}
              </div>
              <div>
                <label className="block text-sm text-gray-600">Mobile</label>
                <input value={editing.mobile} onChange={e=>setEditing(s=>({...s, mobile: e.target.value}))} className="w-full px-3 py-2 border rounded" />
                {editing.__errs?.mobile && <div className="text-xs text-red-600 mt-1">{editing.__errs.mobile}</div>}
              </div>
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              <button onClick={closeEdit} className="px-3 py-1 border rounded">Cancel</button>
              <button onClick={saveEdit} disabled={!editing.name || (editing.__errs && Object.keys(editing.__errs).length>0)} className="px-3 py-1 bg-cyan-600 text-white rounded disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      <Modal open={showDeleteModal} title="Delete voter" onClose={() => setShowDeleteModal(false)} onConfirm={confirmDelete} confirmLabel="Delete" confirmClass="bg-red-600 text-white">
        <div>Delete {deleteTarget}? This action cannot be undone.</div>
      </Modal>

      <Modal open={showBulkDeleteModal} title="Delete selected voters" onClose={() => setShowBulkDeleteModal(false)} onConfirm={confirmBulkDelete} confirmLabel="Delete" confirmClass="bg-red-600 text-white">
        <div>Delete {selected.size} selected voter(s)? This action cannot be undone.</div>
      </Modal>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">Total: {total}</div>
        <div className="space-x-2">
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-3 py-1 border rounded">Prev</button>
          <span>Page {page}</span>
          <button onClick={()=>setPage(p=>p+1)} className="px-3 py-1 border rounded">Next</button>
        </div>
      </div>
    </div>
  );
};

export default AdminVoters;
