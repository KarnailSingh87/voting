import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../utils/axios';
import VoterNavbar from '../../components/VoterNavbar';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005';

// Helper to get full image URL (handles both absolute and relative URLs)
const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${backendUrl}${url}`;
};

const History = () => {
  const navigate = useNavigate();
  const [voteHistory, setVoteHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchVoteHistory = async () => {
      try {
        const token = localStorage.getItem('voterToken');
        const response = await axios.get('/api/voter/history', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.success) {
          // Sort by timestamp descending — latest vote on top
          const sorted = (response.data.voteHistory || []).sort(
            (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
          );
          setVoteHistory(sorted);
        }
      } catch (err) {
        if (err.response?.status === 401) {
          // Token expired or invalid, redirect to login
          localStorage.removeItem('voterToken');
          navigate('/login');
        } else {
          setError('Failed to fetch Voting history');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchVoteHistory();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50">
      <VoterNavbar />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Voting History</h1>
            <p className="mt-1 text-sm text-gray-500">
              View your Voting history and verify your votes
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
                {voteHistory.length === 0 ? (
                  <li className="px-6 py-4 text-center">
                    <p className="text-gray-500">You have not voted in any elections yet</p>
                  </li>
                ) : (
                  voteHistory.map((vote, index) => (
                    <li key={vote.confirmationId}>
                      <div className="px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center flex-1 min-w-0">
                            {/* Candidate Photo */}
                            {vote.candidatePhotoUrl ? (
                              <img 
                                src={getImageUrl(vote.candidatePhotoUrl)} 
                                alt={vote.candidateName} 
                                className="w-12 h-12 rounded-full object-cover mr-4 flex-shrink-0 ring-2 ring-cyan-200"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.style.display = 'none';
                                  if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div 
                              className="w-12 h-12 rounded-full bg-cyan-100 mr-4 flex-shrink-0 flex items-center justify-center text-cyan-700 text-sm font-bold"
                              style={vote.candidatePhotoUrl ? { display: 'none' } : {}}
                            >
                              {(vote.candidateName || '').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-lg font-medium text-gray-900 truncate">
                                {vote.election.title}
                              </h3>
                              <div className="mt-1 flex items-center text-sm text-gray-700">
                                <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-cyan-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                <span>You voted for: <strong className="text-gray-900">{vote.candidateName}</strong></span>
                              </div>
                              <p className="mt-1 text-sm text-gray-500">
                                {new Date(vote.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(vote.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          <div className="ml-4 flex-shrink-0 flex flex-col items-end space-y-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <svg className="-ml-0.5 mr-1.5 h-3 w-3 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              Voted
                            </span>
                            {index === 0 && (
                              <span className="text-[10px] text-cyan-600 font-medium">Latest</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default History;