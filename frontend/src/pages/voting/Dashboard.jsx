import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import axios from '../../utils/axios';
import { io } from 'socket.io-client';
import VoterNavbar from '../../components/VoterNavbar';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005';

// Helper to get full image URL (handles both absolute and relative URLs)
const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${backendUrl}${url}`;
};

// Photo Modal Component
const PhotoModal = ({ photoUrl, name, onClose }) => {
  if (!photoUrl) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={onClose}>
      <div className="relative max-w-3xl max-h-[90vh] p-2">
        <button 
          onClick={onClose}
          className="absolute -top-10 right-0 text-white text-3xl font-bold hover:text-gray-300"
        >
          ×
        </button>
        <img 
          src={photoUrl} 
          alt={name} 
          className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        <p className="text-white text-center mt-2 text-lg font-medium">{name}</p>
      </div>
    </div>
  );
};

PhotoModal.propTypes = {
  photoUrl: PropTypes.string,
  name: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [elections, setElections] = useState([]);
  const [votedElections, setVotedElections] = useState([]); // Track which elections user has voted in
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [photoModal, setPhotoModal] = useState({ show: false, url: null, name: '' });

  useEffect(() => {
    const fetchElections = async () => {
      try {
        const response = await axios.get('/api/election');
        if (response.data.success) {
          setElections(response.data.elections);
        }
      } catch (err) {
        setError('Failed to fetch elections');
      } finally {
        setLoading(false);
      }
    };

    const fetchVotingHistory = async () => {
      try {
        const token = localStorage.getItem('voterToken');
        if (token) {
          const response = await axios.get('/api/voter/history', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.data.success && response.data.voteHistory) {
            // Extract election IDs from voting history
            const votedIds = response.data.voteHistory.map(h => h.electionId).filter(Boolean);
            setVotedElections(votedIds);
          }
        }
      } catch (err) {
        console.log('Could not fetch voting history');
      }
    };

    fetchElections();
    fetchVotingHistory();

    // Socket for live vote updates
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5005');
    socket.on('vote_cast', ({ candidateId, voteCount }) => {
      setElections(prev => prev.map(el => ({
        ...el,
        candidates: el.candidates?.map(c => c.id === candidateId ? { ...c, voteCount } : c) || []
      })));
    });
    socket.on('election_status', ({ id, status }) => {
      setElections(prev => prev.map(el => el._id === id ? { ...el, status } : el));
    });
    return () => { socket.disconnect(); };
  }, []);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Active</span>;
      case 'draft':
        return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Upcoming</span>;
      case 'paused':
        return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">Paused</span>;
      case 'completed':
        return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">Completed</span>;
      default:
        return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Unknown</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <VoterNavbar />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Voting Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">
              View available elections and cast your vote securely
            </p>
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
                    <p className="text-gray-500">No elections available at this time</p>
                  </li>
                ) : (
                  elections.map((election) => (
                    <li key={election._id}>
                      <div className="px-4 py-4 sm:px-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base sm:text-lg font-medium text-gray-900 truncate">
                              {election.title}
                            </h3>
                            <p className="mt-1 text-sm text-gray-500 line-clamp-2 sm:truncate">
                              {election.description}
                            </p>
                            <div className="mt-2 flex items-center text-xs sm:text-sm text-gray-500">
                              <svg className="flex-shrink-0 mr-1.5 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                              </svg>
                              <span>
                                {new Date(election.startDate).toLocaleDateString()} - {new Date(election.endDate).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3 sm:ml-4 sm:flex-shrink-0">
                            {getStatusBadge(election.status)}
                            {votedElections.includes(election._id) ? (
                              <span className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md bg-green-100 text-green-800">
                                <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                Voted <span aria-hidden="true">✓</span>
                              </span>
                            ) : election.status === 'active' ? (
                              <button
                                onClick={() => navigate(`/ballot/${election._id}`)}
                                className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
                              >
                                Vote Now
                              </button>
                            ) : null}
                          </div>
                        </div>
                        
                        {election.candidates && election.candidates.length > 0 && (
                          <div className="mt-4">
                            <h4 className="text-sm font-medium text-gray-900">Candidates</h4>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                              {election.candidates.map((candidate) => (
                                <div key={candidate.id} className="flex items-center p-2 bg-gray-50 rounded-md">
                                  {candidate.photoUrl ? (
                                    <img 
                                      src={getImageUrl(candidate.photoUrl)} 
                                      alt={candidate.name} 
                                      className="w-10 h-10 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-cyan-400 transition-all"
                                      onClick={() => setPhotoModal({ show: true, url: getImageUrl(candidate.photoUrl), name: candidate.name })}
                                      onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                                    />
                                  ) : null}
                                  <div 
                                    className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium"
                                    style={candidate.photoUrl ? { display: 'none' } : {}}
                                  >
                                    {(candidate.name || '').split(' ').map(s => s[0]).slice(0,2).join('')}
                                  </div>
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

        </div>
      </div>

      {/* Photo Modal */}
      {photoModal.show && (
        <PhotoModal 
          photoUrl={photoModal.url} 
          name={photoModal.name} 
          onClose={() => setPhotoModal({ show: false, url: null, name: '' })} 
        />
      )}
    </div>
  );
};

export default Dashboard;