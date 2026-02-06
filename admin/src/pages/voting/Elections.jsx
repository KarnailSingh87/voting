import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import axios from '../../utils/axios';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Sidebar from '../../components/Sidebar';

const Elections = () => {
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    candidates: [{ id: Date.now().toString(), name: '', party: '', description: '', photoFile: null }],
    isPublic: true
  });
  const [uploadingFiles, setUploadingFiles] = useState({});
  // include importConcepts in the form data
  useEffect(() => {
    if (formData && !formData.importConcepts) {
      setFormData(fd => ({ ...fd, importConcepts: { rollField: 'roll', nameField: 'name', emailField: 'email', mobileField: 'mobile', photoField: '' } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    const fetchElections = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const response = await axios.get('/api/admin/election', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.success) {
          setElections(response.data.elections);
        }
      } catch (err) {
        if (err.response?.status === 401) {
          // Token expired or invalid, redirect to login
          localStorage.removeItem('adminToken');
          window.location.href = '/admin/login';
        } else {
          setError('Failed to fetch elections');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchElections();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    window.location.href = '/admin/login';
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleCandidateChange = (index, field, value) => {
    const updatedCandidates = [...formData.candidates];
    updatedCandidates[index][field] = value;
    setFormData({
      ...formData,
      candidates: updatedCandidates
    });
  };

  const handleCandidateFileChange = (index, file) => {
    const updatedCandidates = [...formData.candidates];
    updatedCandidates[index].photoFile = file;
    setFormData({ ...formData, candidates: updatedCandidates });
  };

  const addCandidate = () => {
    setFormData({
      ...formData,
      candidates: [...formData.candidates, { id: Date.now().toString(), name: '', party: '', description: '', photoFile: null }]
    });
  };

  const removeCandidate = (index) => {
    if (formData.candidates.length > 1) {
      const updatedCandidates = [...formData.candidates];
      updatedCandidates.splice(index, 1);
      setFormData({
        ...formData,
        candidates: updatedCandidates
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate dates
    if (new Date(formData.startDate) >= new Date(formData.endDate)) {
      setError('End date must be after start date');
      return;
    }
    
    try {
      const token = localStorage.getItem('adminToken');
      console.log('Creating election:', formData);

      // keep a copy of candidates with files so we can upload after creation
      const localCandidates = formData.candidates ? [...formData.candidates] : [];

      const response = await axios.post('/api/admin/election', formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('Election created:', response.data);

      if (response.data.success) {
        // If backend returned created candidate ids, upload files for each
        if (response.data.candidates && Array.isArray(response.data.candidates)) {
          for (let i = 0; i < response.data.candidates.length; i++) {
            const created = response.data.candidates[i];
            const local = localCandidates[i];
            if (local && local.photoFile) {
              try {
                setUploadingFiles(u => ({ ...u, [created.id]: true }));
                const fd = new FormData();
                fd.append('photo', local.photoFile);
                const up = await axios.post(`/api/admin/candidate/${created.id}/photo`, fd, { headers: { Authorization: `Bearer ${token}` } });
                if (up.data && up.data.success) {
                  toast.success(`Uploaded photo for ${created.name}`);
                } else {
                  toast.error(`Failed to upload photo for ${created.name}`);
                }
              } catch (err) {
                console.error('photo upload failed', err);
                toast.error(`Photo upload failed for ${created.name}`);
              } finally {
                setUploadingFiles(u => ({ ...u, [created.id]: false }));
              }
            }
          }
        }

        // Add new election to the list
        setElections([...elections, response.data.election]);
        // Reset form
        setFormData({
          title: '',
          description: '',
          startDate: '',
          endDate: '',
          candidates: [{ id: Date.now().toString(), name: '', party: '', description: '', photoFile: null }],
          isPublic: true,
          importConcepts: { rollField: 'roll', nameField: 'name', emailField: 'email', mobileField: 'mobile', photoField: '' }
        });
        setShowCreateForm(false);
        setError('');
        toast.success('Election created successfully!');
      }
    } catch (err) {
      console.error('Error creating election:', err);
      console.error('Error response:', err.response?.data);
      setError(err.response?.data?.message || 'Failed to create election');
    }
  };

  const handleStartElection = async (id) => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await axios.patch(`/api/admin/election/${id}/status`, { status: 'ongoing' }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data && (response.data.success || response.data.election)) {
        const newStatus = response.data.election ? response.data.election.status : 'ongoing';
        // Update election status in the list using backend status value
        setElections(elections.map(election => 
          election._id === id ? { ...election, status: newStatus } : election
        ));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start election');
    }
  };

  const handlePauseElection = async (id) => {
    try {
      const token = localStorage.getItem('adminToken');
      // Backend supports statuses: 'scheduled','ongoing','ended'. Map pause -> scheduled
      const response = await axios.patch(`/api/admin/election/${id}/status`, { status: 'scheduled' }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data && (response.data.success || response.data.election)) {
        const newStatus = response.data.election ? response.data.election.status : 'scheduled';
        setElections(elections.map(election => 
          election._id === id ? { ...election, status: newStatus } : election
        ));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to pause election');
    }
  };

  const handleEndElection = async (id) => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await axios.patch(`/api/admin/election/${id}/status`, { status: 'ended' }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data && (response.data.success || response.data.election)) {
        const newStatus = response.data.election ? response.data.election.status : 'ended';
        setElections(elections.map(election => 
          election._id === id ? { ...election, status: newStatus } : election
        ));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to end election');
    }
  };

    const openElectionDetail = (id) => {
      navigate(`/elections/${id}`);
    };

  const getStatusBadge = (status) => {
    // Normalize backend status values and also accept legacy frontend labels
    const s = status;
    if (!s) return null;
    if (s === 'ongoing' || s === 'active') {
      return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Active</span>;
    }
    if (s === 'scheduled' || s === 'draft') {
      return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Draft</span>;
    }
    if (s === 'paused') {
      return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">Paused</span>;
    }
    if (s === 'ended' || s === 'completed') {
      return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">Completed</span>;
    }
    return null;
  };

  // Format date strings defensively. Return a friendly placeholder when missing/invalid
  const formatDate = (d) => {
    try {
      if (!d) return '—';
      const dt = new Date(d);
      if (!Number.isNaN(dt.getTime())) return dt.toLocaleDateString();
      // If parsing failed but original value exists, show the raw value so you can see the stored date string
      return String(d);
    } catch (e) {
      return String(d || '—');
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar onLogout={handleLogout} />
        
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Election Management</h1>
              <p className="mt-1 text-sm text-gray-500">
                Create and manage elections
              </p>
            </div>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
            >
              {showCreateForm ? 'Cancel' : 'Create Election'}
            </button>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Error
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showCreateForm && (
            <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-6">
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Create New Election</h3>
              </div>
              <div className="border-t border-gray-200">
                <form onSubmit={handleSubmit} className="px-4 py-5 sm:p-6">
                  <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                    <div className="sm:col-span-6">
                      <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                        Election Title
                      </label>
                      <input
                        type="text"
                        name="title"
                        id="title"
                        value={formData.title}
                        onChange={handleChange}
                        required
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
                      />
                    </div>

                    <div className="sm:col-span-6">
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                        Description
                      </label>
                      <textarea
                        id="description"
                        name="description"
                        rows={3}
                        value={formData.description}
                        onChange={handleChange}
                        required
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                        Start Date
                      </label>
                      <input
                        type="datetime-local"
                        name="startDate"
                        id="startDate"
                        value={formData.startDate}
                        onChange={handleChange}
                        required
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                        End Date
                      </label>
                      <input
                        type="datetime-local"
                        name="endDate"
                        id="endDate"
                        value={formData.endDate}
                        onChange={handleChange}
                        required
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
                      />
                    </div>

                    <div className="sm:col-span-6">
                      <fieldset>
                        <legend className="text-sm font-medium text-gray-700">Candidates</legend>
                        <div className="mt-4 space-y-4">
                          {formData.candidates.map((candidate, index) => (
                            <div key={candidate.id} className="grid grid-cols-1 gap-y-4 gap-x-4 sm:grid-cols-12 p-4 border border-gray-200 rounded-md">
                              <div className="sm:col-span-4">
                                <label htmlFor={`candidate-name-${index}`} className="block text-sm font-medium text-gray-700">
                                  Name
                                </label>
                                <input
                                  type="text"
                                  id={`candidate-name-${index}`}
                                  value={candidate.name}
                                  onChange={(e) => handleCandidateChange(index, 'name', e.target.value)}
                                  required
                                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
                                />
                              </div>
                              <div className="sm:col-span-3">
                                <label htmlFor={`candidate-party-${index}`} className="block text-sm font-medium text-gray-700">
                                  Party
                                </label>
                                <input
                                  type="text"
                                  id={`candidate-party-${index}`}
                                  value={candidate.party}
                                  onChange={(e) => handleCandidateChange(index, 'party', e.target.value)}
                                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
                                />
                              </div>
                              <div className="sm:col-span-4">
                                <label htmlFor={`candidate-description-${index}`} className="block text-sm font-medium text-gray-700">
                                  Description
                                </label>
                                <input
                                  type="text"
                                  id={`candidate-description-${index}`}
                                  value={candidate.description}
                                  onChange={(e) => handleCandidateChange(index, 'description', e.target.value)}
                                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
                                />
                                <div className="mt-2 flex items-center space-x-3">
                                  {candidate.photoFile ? (
                                    <img src={URL.createObjectURL(candidate.photoFile)} alt="preview" className="w-12 h-12 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500">No photo</div>
                                  )}
                                  <div>
                                    <label htmlFor={`candidate-photo-${index}`} className="px-2 py-1 bg-gray-100 rounded text-sm cursor-pointer">Select photo</label>
                                    <input id={`candidate-photo-${index}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleCandidateFileChange(index, e.target.files && e.target.files[0])} />
                                  </div>
                                </div>
                              </div>
                              <div className="sm:col-span-1 flex items-end">
                                <button
                                  type="button"
                                  onClick={() => removeCandidate(index)}
                                  className="inline-flex items-center p-2 border border-transparent rounded-full shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                >
                                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={addCandidate}
                              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-cyan-700 bg-cyan-100 hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
                            >
                              <svg className="-ml-0.5 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                              </svg>
                              Add Candidate
                            </button>
                          </div>
                        </div>
                      </fieldset>
                    </div>

                    <div className="sm:col-span-6">
                      <h4 className="text-sm font-medium text-gray-700">Import Settings (defaults)</h4>
                      <div className="mt-2 grid grid-cols-1 gap-y-3 sm:grid-cols-3">
                        <div>
                          <label className="block text-sm text-gray-700">Roll field</label>
                          <input type="text" name="import_roll" value={formData.importConcepts?.rollField || 'roll'} onChange={(e)=> setFormData({ ...formData, importConcepts: { ...(formData.importConcepts||{}), rollField: e.target.value } })} className="mt-1 block w-full border rounded px-2 py-1" />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-700">Name field</label>
                          <input type="text" name="import_name" value={formData.importConcepts?.nameField || 'name'} onChange={(e)=> setFormData({ ...formData, importConcepts: { ...(formData.importConcepts||{}), nameField: e.target.value } })} className="mt-1 block w-full border rounded px-2 py-1" />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-700">Email field</label>
                          <input type="text" name="import_email" value={formData.importConcepts?.emailField || 'email'} onChange={(e)=> setFormData({ ...formData, importConcepts: { ...(formData.importConcepts||{}), emailField: e.target.value } })} className="mt-1 block w-full border rounded px-2 py-1" />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-700">Mobile field</label>
                          <input type="text" name="import_mobile" value={formData.importConcepts?.mobileField || 'mobile'} onChange={(e)=> setFormData({ ...formData, importConcepts: { ...(formData.importConcepts||{}), mobileField: e.target.value } })} className="mt-1 block w-full border rounded px-2 py-1" />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-700">Photo field (optional)</label>
                          <input type="text" name="import_photo" value={formData.importConcepts?.photoField || ''} onChange={(e)=> setFormData({ ...formData, importConcepts: { ...(formData.importConcepts||{}), photoField: e.target.value } })} className="mt-1 block w-full border rounded px-2 py-1" />
                        </div>
                      </div>
                    </div>

                    <div className="sm:col-span-6">
                      <div className="flex items-center">
                        <input
                          id="isPublic"
                          name="isPublic"
                          type="checkbox"
                          checked={formData.isPublic}
                          onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                          className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-gray-300 rounded"
                        />
                        <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-900">
                          Make election public
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end">
                    <button
                      type="submit"
                      className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
                    >
                      Create Election
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <svg className="animate-spin h-10 w-10 text-cyan-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : (
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {elections.length === 0 ? (
                  <li className="px-6 py-4 text-center">
                    <p className="text-gray-500">No elections found</p>
                  </li>
                ) : (
                  elections.map((election) => (
                    <li key={election._id}>
                      <div className="px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-medium text-gray-900 truncate">
                              {election.title}
                            </h3>
                            <p className="mt-1 text-sm text-gray-500 truncate">
                              {election.description}
                            </p>
                            <div className="mt-2 flex items-center text-sm text-gray-500">
                              <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                              </svg>
                              <span>
                                {formatDate(election.startTime || election.startDate)} - {formatDate(election.endTime || election.endDate)}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4 flex-shrink-0 flex items-center space-x-3">
                            {getStatusBadge(election.status)}
                            <button
                              onClick={() => openElectionDetail(election._id)}
                              className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-cyan-700 bg-cyan-100 hover:bg-cyan-200 focus:outline-none"
                            >
                              View
                            </button>
                            {/* Import button removed as per election management preference */}
                            {election.status === 'draft' && (
                              <button
                                onClick={() => handleStartElection(election._id)}
                                className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                              >
                                Start
                              </button>
                            )}
                            {election.status === 'active' && (
                              <button
                                onClick={() => handlePauseElection(election._id)}
                                className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                              >
                                Pause
                              </button>
                            )}
                            {(election.status === 'active' || election.status === 'paused') && (
                              <button
                                onClick={() => handleEndElection(election._id)}
                                className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                              >
                                End
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {election.candidates && election.candidates.length > 0 && (
                          <div className="mt-4">
                            <h4 className="text-sm font-medium text-gray-900">Candidates</h4>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                              {election.candidates.map((candidate) => (
                                <div key={candidate.id} className="flex items-center p-2 bg-gray-50 rounded-md">
                                  <div className="ml-3 text-sm">
                                    <p className="font-medium text-gray-900">{candidate.name}</p>
                                    {candidate.party && (
                                      <p className="text-gray-500">{candidate.party}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </main>

      </div>
    </div>
  );
};

export default Elections;