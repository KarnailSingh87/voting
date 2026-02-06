import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from '../../utils/axios';

const Ballot = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [election, setElection] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [Voting, setVoting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchElection = async () => {
      try {
        const response = await axios.get(`/api/election/${id}`);
        if (response.data.success) {
          setElection(response.data.election);
        }
      } catch (err) {
        setError('Failed to fetch election details');
      } finally {
        setLoading(false);
      }
    };

    fetchElection();
  }, [id]);

  const handleVote = async () => {
    setVoting(true);
    setError('');
    
    try {
      const token = localStorage.getItem('voterToken');
      const response = await axios.post('/api/vote/cast', 
        { electionId: id, candidateId: selectedCandidate },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setShowConfirmation(false);
        setShowSuccess(true);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cast vote');
    } finally {
      setVoting(false);
    }
  };

  const handleConfirmVote = () => {
    setShowConfirmation(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="animate-spin h-10 w-10 text-cyan-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="rounded-md bg-red-50 p-4 max-w-md">
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
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
          <div className="text-center">
            <svg className="mx-auto h-16 w-16 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">Vote Cast Successfully!</h2>
            <p className="mt-2 text-gray-600">
              Your vote has been securely recorded and encrypted. Thank you for participating in the democratic process.
            </p>
            <div className="mt-6">
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-cyan-700">SecureVote</h1>
              </div>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:items-center">
              <button
                onClick={() => navigate('/dashboard')}
                className="ml-2 bg-white rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
              >
                <span className="sr-only">Back to Dashboard</span>
                <span className="h-8 w-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-800 font-medium">
                  Back
                </span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Cast Your Vote</h1>
            <p className="mt-1 text-sm text-gray-500">
              Select a candidate and confirm your vote
            </p>
          </div>

          {showConfirmation ? (
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Confirm Your Vote</h3>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                  Please review your selection before confirming
                </p>
              </div>
              <div className="border-t border-gray-200">
                <dl>
                  <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Election</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{election.title}</dd>
                  </div>
                  <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Your Selection</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      {election.candidates.find(c => c.id === selectedCandidate)?.name}
                    </dd>
                  </div>
                  <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Security Assurance</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      Your vote will be encrypted and separated from your identity before storage. 
                      A confirmation receipt will be provided for verification.
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="px-4 py-4 bg-gray-50 sm:px-6 flex justify-end space-x-3">
                <button
                  onClick={() => setShowConfirmation(false)}
                  className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVote}
                  disabled={Voting}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-50"
                >
                  {Voting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Casting Vote...
                    </>
                  ) : 'Confirm Vote'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">{election.title}</h3>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">{election.description}</p>
              </div>
              <div className="border-t border-gray-200">
                <dl>
                  <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Voting Period</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      {new Date(election.startDate).toLocaleDateString()} - {new Date(election.endDate).toLocaleDateString()}
                    </dd>
                  </div>
                  <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Select Candidate</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      <div className="space-y-4">
                        {election.candidates.map((candidate) => (
                          <div key={candidate.id} className="flex items-center">
                            <input
                              id={`candidate-${candidate.id}`}
                              name="candidate"
                              type="radio"
                              checked={selectedCandidate === candidate.id}
                              onChange={() => setSelectedCandidate(candidate.id)}
                              className="focus:ring-cyan-500 h-4 w-4 text-cyan-600 border-gray-300"
                            />
                            <label htmlFor={`candidate-${candidate.id}`} className="ml-3 block text-sm font-medium text-gray-700">
                              <div className="font-medium">{candidate.name}</div>
                              {candidate.party && (
                                <div className="text-gray-500">{candidate.party}</div>
                              )}
                              {candidate.description && (
                                <div className="text-gray-500 text-xs mt-1">{candidate.description}</div>
                              )}
                            </label>
                          </div>
                        ))}
                      </div>
                    </dd>
                  </div>
                  <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Security Information</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Your vote will be encrypted and stored securely</li>
                        <li>Your identity is cryptographically separated from your vote</li>
                        <li>You will receive a confirmation receipt for verification</li>
                        <li>All Voting data is immutable and auditable</li>
                      </ul>
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="px-4 py-4 bg-gray-50 sm:px-6 flex justify-end">
                <button
                  onClick={handleConfirmVote}
                  disabled={!selectedCandidate || Voting}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-50"
                >
                  Review & Confirm Vote
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Ballot;