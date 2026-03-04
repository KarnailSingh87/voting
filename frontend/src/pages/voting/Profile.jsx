import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../utils/axios';
import { toast } from 'react-toastify';
import VoterNavbar from '../../components/VoterNavbar';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005';

// Helper to get full image URL
const getImageUrl = (url) => {
  if (!url) return null;
  // base64 data URIs are already complete
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${backendUrl}${url}`;
};

const Profile = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('voterToken');
      if (!token) {
        navigate('/login');
        return;
      }
      
      const response = await axios.get('/api/voter/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setProfile(response.data.profile);
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('voterToken');
        navigate('/login');
        return;
      }
      setError('Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [navigate]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('photo', file);

    try {
      const token = localStorage.getItem('voterToken');
      const response = await axios.post('/api/voter/upload-photo', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        toast.success('Photo uploaded successfully');
        // Refresh profile to get updated photo
        fetchProfile();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
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
          <p className="text-red-800">{error}</p>
          <button onClick={() => navigate('/dashboard')} className="mt-4 text-cyan-600 hover:underline">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <VoterNavbar />

      {/* Main Content */}
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Profile Header */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-6 sm:px-6 sm:py-8">
            <div className="flex flex-col items-center sm:flex-row sm:items-center text-center sm:text-left">
              {/* Avatar with upload overlay */}
              <div className="relative group">
                {profile?.photoUrl ? (
                  <img
                    src={getImageUrl(profile.photoUrl)}
                    alt={profile.name}
                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center text-cyan-600 text-3xl font-bold shadow-lg">
                    {profile?.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                )}
                {/* Camera overlay button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 w-24 h-24 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center transition-all cursor-pointer"
                  title="Upload photo"
                >
                  <svg
                    className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                {uploading && (
                  <div className="absolute inset-0 w-24 h-24 rounded-full bg-black bg-opacity-50 flex items-center justify-center">
                    <svg className="animate-spin h-8 w-8 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                )}
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>
              <div className="mt-4 sm:mt-0 sm:ml-6 text-white">
                <h1 className="text-xl sm:text-2xl font-bold">{profile?.name}</h1>
                <p className="text-cyan-100 mt-1">Roll No: {profile?.roll}</p>
                {profile?.program && (
                  <p className="text-cyan-100 text-sm mt-1">{profile.program} {profile.batch && `• Batch ${profile.batch}`}</p>
                )}
                {!profile?.photoUrl && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 text-xs text-cyan-200 hover:text-white underline transition-colors"
                  >
                    📷 Upload your photo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Voting Status Badge */}
          <div className="px-4 py-3 sm:px-6 sm:py-4 bg-gray-50 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center">
              <span className="text-sm text-gray-500">Voting Status:</span>
              {profile?.totalVotes > 0 ? (
                <span className="ml-2 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Voted ({profile.totalVotes} {profile.totalVotes === 1 ? 'election' : 'elections'})
                </span>
              ) : (
                <span className="ml-2 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                  Not Voted Yet
                </span>
              )}
            </div>
            {profile?.verifiedAt && (
              <span className="text-xs text-gray-400">
                Verified on {new Date(profile.verifiedAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Profile Details */}
          <div className="px-4 py-4 sm:px-6 sm:py-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-500">Full Name</label>
                <p className="mt-1 text-gray-900">{profile?.name || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Roll Number</label>
                <p className="mt-1 text-gray-900">{profile?.roll || '-'}</p>
              </div>
              {profile?.fatherName && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">Father's Name</label>
                  <p className="mt-1 text-gray-900">{profile.fatherName}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-500">Mobile Number</label>
                <p className="mt-1 text-gray-900">{profile?.mobile || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Email</label>
                <p className="mt-1 text-gray-900">{profile?.email || '-'}</p>
              </div>
              {profile?.program && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">Program</label>
                  <p className="mt-1 text-gray-900">{profile.program}</p>
                </div>
              )}
              {profile?.batch && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">Batch</label>
                  <p className="mt-1 text-gray-900">{profile.batch}</p>
                </div>
              )}
              {profile?.bloodGroup && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">Blood Group</label>
                  <p className="mt-1 text-gray-900">{profile.bloodGroup}</p>
                </div>
              )}
              {profile?.category && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">Category</label>
                  <p className="mt-1 text-gray-900">{profile.category}</p>
                </div>
              )}
              {profile?.address && (
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-500">Address</label>
                  <p className="mt-1 text-gray-900">{profile.address}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Voting History */}
        {profile?.votingHistory && profile.votingHistory.length > 0 && (
          <div className="mt-6 bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Voting History</h2>
            </div>
            <div className="divide-y">
              {profile.votingHistory.map((vote, index) => (
                <div key={index} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{vote.electionTitle}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(vote.timestamp).toLocaleDateString()} at {new Date(vote.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Confirmed
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Account Info */}
        <div className="mt-6 bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Account Information</h2>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500">Account Created</label>
                <p className="mt-1 text-gray-900">
                  {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '-'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Last Verified</label>
                <p className="mt-1 text-gray-900">
                  {profile?.verifiedAt ? new Date(profile.verifiedAt).toLocaleDateString() : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
