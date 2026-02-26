/* global Set, Promise */
import { useState, useEffect, useRef } from 'react';
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

  const fetchData = async () => {
    setLoading(true); setError('');
    try {
      const params = { q, page, limit: 50 };
      if (selectedElection) params.electionId = selectedElection;
      const res = await axios.get('/api/admin/students', { params });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
      setBackendHealthy(true);
    } catch (e) {
      if (!e.response) {
        setBackendHealthy(false);
        setError(`Network error: could not reach backend at ${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005'}`);
      } else {
        setError(e.response?.data?.message || e.message || 'Failed to fetch');
      }
    } finally { setLoading(false); }
  };

  // Fetch on page/election change
  useEffect(() => { 
    fetchData(); 
  }, [page, selectedElection]);

  // debounce search input for smoother UX
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchData();
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

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
        const res = await axios.get('/api/admin/election');
        if (res.data && mounted) setElections(res.data.elections || []);
      } catch (e) { /* ignore elections load failure silently */ }
    })();
    return () => { mounted = false; };
  }, []);

  const toggleVoted = async (roll, voted) => {
    try {
      await axios.patch(`/api/admin/students/${encodeURIComponent(roll)}`, { voted: !!voted });
      fetchData();
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
      fetchData();
    } catch (e) { setError(e.response?.data?.message || e.message); }
  };

  const exportSelected = () => {
    const rows = items.filter(i => selected.has(i.roll)).map(i => {
      const escapeCsv = (val) => {
        if (val == null) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      return [
        escapeCsv(i.roll),
        escapeCsv(i.name),
        escapeCsv(i.fatherName),
        escapeCsv(i.email),
        escapeCsv(i.mobile),
        escapeCsv(i.address),
        escapeCsv(i.voted ? 'Yes' : 'No'),
        escapeCsv(i.masterList ? 'Master' : (i.elections?.length || 0) + ' election(s)'),
        escapeCsv(i.registeredAt ? new Date(i.registeredAt).toISOString() : '')
      ].join(',');
    });
    if (rows.length === 0) return;
    const csv = 'roll,name,fatherName,email,mobile,address,voted,scope,registeredAt\n' + rows.join('\n');
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
    try { await axios.delete(`/api/admin/students/${encodeURIComponent(roll)}`); toast.success('Deleted'); fetchData(); } catch (e) { const msg = e.response?.data?.message || e.message; setError(msg); toast.error(msg); }
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
      fetchData();
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
      await axios.patch(`/api/admin/students/${encodeURIComponent(editing.roll)}`, { 
        name: editing.name, 
        email: editing.email, 
        mobile: editing.mobile,
        fatherName: editing.fatherName,
        address: editing.address
      });
      toast.success('Saved');
      closeEdit(); fetchData();
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
        <button onClick={()=>{ setPage(1); fetchData(); }} className="px-3 py-2 bg-cyan-600 text-white rounded">Search</button>
      </div>

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => bulkUpdate(true)} className="px-3 py-1 bg-blue-600 text-white rounded">Mark Selected Voted</button>
        <button onClick={() => bulkUpdate(false)} className="px-3 py-1 bg-gray-200 rounded">Unmark Selected</button>
        <button onClick={exportSelected} className="px-3 py-1 bg-green-600 text-white rounded">Export Selected</button>
        <button onClick={removeSelected} className="px-3 py-1 bg-red-600 text-white rounded">Delete Selected</button>
      </div>
      {loading ? <div>Loading...</div> : (
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse min-w-max">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 px-2"><input type="checkbox" onChange={(e)=>{ if(e.target.checked) setSelected(new Set(items.map(i=>i.roll))); else setSelected(new Set()); }} checked={items.length>0 && selected.size===items.length} /></th>
                <th className="py-2 px-2">Photo</th>
                <th className="py-2 px-2">Roll</th>
                <th className="py-2 px-2">Name</th>
                <th className="py-2 px-2">Father Name</th>
                <th className="py-2 px-2">Email</th>
                <th className="py-2 px-2">Mobile</th>
                <th className="py-2 px-2">Address</th>
                <th className="py-2 px-2">Scope</th>
                <th className="py-2 px-2">Voted</th>
                <th className="py-2 px-2">Registered</th>
                <th className="py-2 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s._id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2"><input type="checkbox" checked={selected.has(s.roll)} onChange={()=>toggleSelected(s.roll)} /></td>
                  <td className="py-2 px-2">
                    {s.photo ? (
                      <img src={s.photo.startsWith('http') ? s.photo : `${import.meta.env.VITE_BACKEND_URL || ''}${s.photo}`} alt={s.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">N/A</div>
                    )}
                  </td>
                  <td className="py-2 px-2 font-mono text-sm">{s.roll}</td>
                  <td className="py-2 px-2">{s.name}</td>
                  <td className="py-2 px-2">{s.fatherName || <span className="text-gray-400">—</span>}</td>
                  <td className="py-2 px-2">{s.email || <span className="text-gray-400">—</span>}</td>
                  <td className="py-2 px-2">{s.mobile || <span className="text-gray-400">—</span>}</td>
                  <td className="py-2 px-2 max-w-xs truncate" title={s.address || ''}>{s.address || <span className="text-gray-400">—</span>}</td>
                  <td className="py-2 px-2">
                    {s.masterList ? (
                      <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs">Master</span>
                    ) : (s.elections && s.elections.length > 0 ? (
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">{s.elections.length} election(s)</span>
                    ) : (
                      <span className="text-sm text-gray-500">—</span>
                    ))}
                  </td>
                  <td className="py-2 px-2">
                    {s.voted ? (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Yes</span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">No</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-sm text-gray-600">
                    {s.registeredAt ? new Date(s.registeredAt).toLocaleDateString() : (s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—')}
                  </td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    <button onClick={()=>toggleVoted(s.roll, !s.voted)} className="mr-1 px-2 py-1 bg-blue-600 text-white rounded text-sm">{s.voted ? 'Unmark' : 'Mark Voted'}</button>
                    <button onClick={()=>openEdit(s)} className="mr-1 px-2 py-1 bg-yellow-500 text-white rounded text-sm">Edit</button>
                    <button onClick={()=>remove(s.roll)} className="px-2 py-1 bg-red-600 text-white rounded text-sm">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inline edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-[500px] max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium mb-3">Edit Voter {editing.roll}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600">Name</label>
                <input value={editing.name || ''} onChange={e=>setEditing(s=>({...s, name: e.target.value}))} className="w-full px-3 py-2 border rounded" />
                {editing.__errs?.name && <div className="text-xs text-red-600 mt-1">{editing.__errs.name}</div>}
              </div>
              <div>
                <label className="block text-sm text-gray-600">Father Name</label>
                <input value={editing.fatherName || ''} onChange={e=>setEditing(s=>({...s, fatherName: e.target.value}))} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Email</label>
                <input value={editing.email || ''} onChange={e=>setEditing(s=>({...s, email: e.target.value}))} className="w-full px-3 py-2 border rounded" />
                {editing.__errs?.email && <div className="text-xs text-red-600 mt-1">{editing.__errs.email}</div>}
              </div>
              <div>
                <label className="block text-sm text-gray-600">Mobile</label>
                <input value={editing.mobile || ''} onChange={e=>setEditing(s=>({...s, mobile: e.target.value}))} className="w-full px-3 py-2 border rounded" />
                {editing.__errs?.mobile && <div className="text-xs text-red-600 mt-1">{editing.__errs.mobile}</div>}
              </div>
              <div>
                <label className="block text-sm text-gray-600">Address</label>
                <textarea value={editing.address || ''} onChange={e=>setEditing(s=>({...s, address: e.target.value}))} className="w-full px-3 py-2 border rounded" rows={2} />
              </div>
              {editing.photo && (
                <div>
                  <label className="block text-sm text-gray-600">Photo</label>
                  <img src={editing.photo.startsWith('http') ? editing.photo : `${import.meta.env.VITE_BACKEND_URL || ''}${editing.photo}`} alt={editing.name} className="w-20 h-20 rounded object-cover mt-1" />
                </div>
              )}
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
