/* global Set, Promise */
import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import axios from '../../utils/axios';
import Modal from '../../components/Modal';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005';

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
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [viewAll, setViewAll] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null); // { name, roll, src }

  const getPhotoUrl = (roll) =>
    `${BACKEND}/api/admin/students/${encodeURIComponent(roll)}/photo?token=${localStorage.getItem('adminToken') || ''}`;

  const fetchData = async () => {
    setLoading(true); setError('');
    try {
      const limit = viewAll ? 10000 : 50; // Fetch all if viewAll is true
      const params = { q, page: viewAll ? 1 : page, limit };
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
  }, [page, selectedElection, viewAll]);

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
        escapeCsv(i.name),
        escapeCsv(i.fatherName),
        escapeCsv(i.bloodGroup),
        escapeCsv(i.mobile),
        escapeCsv(i.program),
        escapeCsv(i.address),
        escapeCsv(i.category),
        escapeCsv(i.batch),
        escapeCsv(i.roll),
        escapeCsv(i.photo)
      ].join(',');
    });
    if (rows.length === 0) return;
    const csv = 'Name,Father\'s Name,Blood Group,Mobile,Program,Address,Category,Batch,Roll No,Photo URL\n' + rows.join('\n');
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

  const openEdit = (student) => {
    setEditing({ ...student });
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
  };
  const closeEdit = () => {
    setEditing(null);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
  };
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
      // Save text fields
      await axios.patch(`/api/admin/students/${encodeURIComponent(editing.roll)}`, { 
        name: editing.name, 
        email: editing.email, 
        mobile: editing.mobile,
        fatherName: editing.fatherName,
        bloodGroup: editing.bloodGroup,
        program: editing.program,
        address: editing.address,
        category: editing.category,
        batch: editing.batch
      });
      // If photo file selected, upload it
      if (photoFile) {
        const formData = new FormData();
        formData.append('photo', photoFile);
        await axios.post(`/api/admin/students/${encodeURIComponent(editing.roll)}/photo`, formData, {
          headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${localStorage.getItem('adminToken')}` }
        });
        toast.success('Photo uploaded');
      }
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
      {/* Photo stats */}
      {items.length > 0 && (
        <div className="mb-3 text-sm text-gray-500">
          📷 {items.filter(i => i.hasPhoto).length}/{items.length} voters have photos on this page
        </div>
      )}
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
              <tr className="text-left border-b bg-gray-100">
                <th className="py-2 px-2"><input type="checkbox" onChange={(e)=>{ if(e.target.checked) setSelected(new Set(items.map(i=>i.roll))); else setSelected(new Set()); }} checked={items.length>0 && selected.size===items.length} /></th>
                <th className="py-2 px-2">Photo</th>
                <th className="py-2 px-2">Name</th>
                <th className="py-2 px-2">Father Name</th>
                <th className="py-2 px-2">Blood Group</th>
                <th className="py-2 px-2">Mobile</th>
                <th className="py-2 px-2">Program</th>
                <th className="py-2 px-2">Address</th>
                <th className="py-2 px-2">Category</th>
                <th className="py-2 px-2">Batch</th>
                <th className="py-2 px-2">Roll No</th>
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
                    <div
                      className="relative w-11 h-11 cursor-pointer group"
                      onClick={() => s.hasPhoto && setPhotoPreview({ name: s.name, roll: s.roll, src: getPhotoUrl(s.roll) })}
                      title={s.hasPhoto ? 'Click to enlarge' : s.name || 'N/A'}
                    >
                      {s.hasPhoto ? (
                        <img
                          src={getPhotoUrl(s.roll)}
                          alt={s.name}
                          className="w-11 h-11 rounded-full object-cover border-2 border-cyan-200 group-hover:border-cyan-500 transition-all shadow-sm"
                          loading="lazy"
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }}
                        />
                      ) : null}
                      <div
                        className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-100 to-cyan-200 flex items-center justify-center text-cyan-700 text-sm font-bold border border-cyan-300"
                        style={{ display: s.hasPhoto ? 'none' : 'flex' }}
                      >
                        {s.name ? s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'N/A'}
                      </div>
                      {s.hasPhoto && (
                        <div className="absolute inset-0 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center">
                          <svg className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-2 font-semibold">{s.name}</td>
                  <td className="py-2 px-2">{s.fatherName || <span className="text-gray-400">—</span>}</td>
                  <td className="py-2 px-2 text-center font-mono">{s.bloodGroup || <span className="text-gray-400">—</span>}</td>
                  <td className="py-2 px-2">{s.mobile || <span className="text-gray-400">—</span>}</td>
                  <td className="py-2 px-2">{s.program || <span className="text-gray-400">—</span>}</td>
                  <td className="py-2 px-2 max-w-xs truncate" title={s.address || ''}>{s.address || <span className="text-gray-400">—</span>}</td>
                  <td className="py-2 px-2 text-center">
                    <span className={`px-2 py-1 rounded text-xs ${s.category === 'General' ? 'bg-blue-100 text-blue-800' : s.category === 'SC' ? 'bg-green-100 text-green-800' : s.category === 'ST' ? 'bg-orange-100 text-orange-800' : 'bg-purple-100 text-purple-800'}`}>
                      {s.category || '—'}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">{s.batch || <span className="text-gray-400">—</span>}</td>
                  <td className="py-2 px-2 font-mono text-sm font-semibold">{s.roll}</td>
                  <td className="py-2 px-2">
                    {s.voted ? (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">✓ Yes</span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">✗ No</span>
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

      {/* Show pagination/view all info */}
      <div className="mt-4 text-xs text-gray-500 mb-2">
        Showing {items.length} of {total} total voters
        {viewAll && <span> (View All mode)</span>}
      </div>

      {/* Inline edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-[600px] max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium mb-3">Edit Voter {editing.roll}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name *</label>
                <input value={editing.name || ''} onChange={e=>setEditing(s=>({...s, name: e.target.value}))} className="w-full px-3 py-2 border rounded" />
                {editing.__errs?.name && <div className="text-xs text-red-600 mt-1">{editing.__errs.name}</div>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Father's Name</label>
                <input value={editing.fatherName || ''} onChange={e=>setEditing(s=>({...s, fatherName: e.target.value}))} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Blood Group</label>
                <input value={editing.bloodGroup || ''} onChange={e=>setEditing(s=>({...s, bloodGroup: e.target.value}))} placeholder="e.g., B+, O-, AB+" className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Mobile</label>
                <input value={editing.mobile || ''} onChange={e=>setEditing(s=>({...s, mobile: e.target.value}))} className="w-full px-3 py-2 border rounded" />
                {editing.__errs?.mobile && <div className="text-xs text-red-600 mt-1">{editing.__errs.mobile}</div>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Program</label>
                <input value={editing.program || ''} onChange={e=>setEditing(s=>({...s, program: e.target.value}))} placeholder="e.g., B.Tech CSE" className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Address</label>
                <textarea value={editing.address || ''} onChange={e=>setEditing(s=>({...s, address: e.target.value}))} className="w-full px-3 py-2 border rounded" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Category</label>
                <select value={editing.category || ''} onChange={e=>setEditing(s=>({...s, category: e.target.value}))} className="w-full px-3 py-2 border rounded">
                  <option value="">-- Select --</option>
                  <option value="General">General</option>
                  <option value="SC">SC</option>
                  <option value="ST">ST</option>
                  <option value="OBC">OBC</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Batch</label>
                <input value={editing.batch || ''} onChange={e=>setEditing(s=>({...s, batch: e.target.value}))} placeholder="e.g., 2023-2027" className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Photo</label>
                <div className="flex items-center gap-4 mt-2">
                  {photoPreviewUrl ? (
                    <img src={photoPreviewUrl} alt="Preview" className="w-24 h-24 rounded-lg object-cover border border-cyan-300" />
                  ) : editing.hasPhoto ? (
                    <img src={getPhotoUrl(editing.roll)} alt={editing.name} className="w-24 h-24 rounded-lg object-cover border border-gray-200" />
                  ) : (
                    <div className="w-24 h-24 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">No photo</div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files[0];
                      if (file) {
                        setPhotoFile(file);
                        const reader = new FileReader();
                        reader.onload = ev => setPhotoPreviewUrl(ev.target.result);
                        reader.readAsDataURL(file);
                      } else {
                        setPhotoFile(null);
                        setPhotoPreviewUrl(null);
                      }
                    }}
                  />
                </div>
                {photoFile && <div className="text-xs text-gray-500 mt-1">Selected: {photoFile.name}</div>}
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

      {/* Photo preview lightbox */}
      {photoPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]" onClick={() => setPhotoPreview(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-4 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{photoPreview.name}</h3>
                <p className="text-sm text-gray-500 font-mono">{photoPreview.roll}</p>
              </div>
              <button onClick={() => setPhotoPreview(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <img
              src={photoPreview.src}
              alt={photoPreview.name}
              className="w-full h-auto max-h-[60vh] object-contain rounded-lg border border-gray-100"
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">Total: {total}</div>
        <div className="space-x-2">
          <button onClick={()=>{ setViewAll(!viewAll); setPage(1); }} className={`px-3 py-1 rounded ${viewAll ? 'bg-cyan-600 text-white' : 'border'}`}>
            {viewAll ? '✓ View All' : 'View All'}
          </button>
          {!viewAll && (
            <>
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-3 py-1 border rounded">Prev</button>
              <span>Page {page}</span>
              <button onClick={()=>setPage(p=>p+1)} className="px-3 py-1 border rounded">Next</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminVoters;
