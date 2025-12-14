import { useState, useEffect } from 'react';
import axios from 'axios';
import { auth } from "../firebaseConfig";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import '../css/dashboard.css';

// Configure API URL (Switch to your Render URL when deploying)
const API_BASE = "http://localhost:5001";

function Dashboard() {
  const [user, setUser] = useState(null);
  const [nurses, setNurses] = useState([]);
  // Added 'dailyRate' for payroll/info
  const [formData, setFormData] = useState({ name: '', phone: '', dailyRate: '' });

  // Search & Modal State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNurse, setSelectedNurse] = useState(null);
  const [activeTab, setActiveTab] = useState('attendance'); // Controls Tabs (Attendance vs Docs)
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Document Upload State
  const [docFile, setDocFile] = useState(null);
  const [docName, setDocName] = useState('');
  const [uploading, setUploading] = useState(false);

  const navigate = useNavigate();

  // --- STATS LOGIC ---
  const totalStaff = nurses.length;
  const presentToday = nurses.filter(n => {
    if (!n.logs || n.logs.length === 0) return false;
    const lastLog = new Date(n.logs[n.logs.length - 1].time);
    const today = new Date();
    return lastLog.getDate() === today.getDate() &&
      lastLog.getMonth() === today.getMonth() &&
      lastLog.getFullYear() === today.getFullYear();
  }).length;
  const absentToday = totalStaff - presentToday;

  // --- AUTH & FETCH ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        fetchNurses(currentUser.uid);
      } else {
        navigate('/');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const fetchNurses = async (ownerId) => {
    try {
      const res = await axios.get(`${API_BASE}/api/nurses?ownerId=${ownerId}`);
      setNurses(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (user) {
      const interval = setInterval(() => fetchNurses(user.uid), 5000); // Auto-refresh
      return () => clearInterval(interval);
    }
  }, [user]);

  // --- ACTIONS ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    try {
      // Send dailyRate along with name and phone
      await axios.post(`${API_BASE}/api/nurses`, {
        ...formData,
        ownerId: user.uid
      });
      setFormData({ name: '', phone: '', dailyRate: '' });
      fetchNurses(user.uid);
      alert("Nurse added! Ask her to message the Telegram Bot now.");
    } catch (error) { console.error(error); }
  };

  const handleDelete = async (nurseId) => {
    if (!window.confirm("Delete this nurse?")) return;
    try {
      await axios.delete(`${API_BASE}/api/nurses/${nurseId}?ownerId=${user.uid}`);
      fetchNurses(user.uid);
    } catch (error) { alert("Failed to delete."); }
  };

  // --- DOCUMENT UPLOAD HANDLER ---
  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!docFile || !selectedNurse) return;

    const data = new FormData();
    data.append('file', docFile);
    data.append('docName', docName || docFile.name);

    setUploading(true);
    try {
      await axios.post(`${API_BASE}/api/nurses/${selectedNurse._id}/documents`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert("Document Uploaded! ✅");

      // Reset form
      setDocFile(null);
      setDocName('');

      // Refresh Data & Update Modal State immediately
      fetchNurses(user.uid);
      const res = await axios.get(`${API_BASE}/api/nurses?ownerId=${user.uid}`);
      const updatedNurse = res.data.find(n => n._id === selectedNurse._id);
      setSelectedNurse(updatedNurse);

    } catch (error) {
      console.error(error);
      alert("Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // --- CALENDAR HELPER ---
  const isPresent = (date) => {
    if (!selectedNurse || !selectedNurse.logs) return false;
    return selectedNurse.logs.some(log => {
      const logDate = new Date(log.time);
      return logDate.getDate() === date.getDate() &&
        logDate.getMonth() === date.getMonth() &&
        logDate.getFullYear() === date.getFullYear();
    });
  };

  // --- FILTER ---
  const filteredNurses = nurses.filter(nurse =>
    nurse.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    nurse.phone.includes(searchQuery)
  );

  // --- DELETE DOC HANDLER ---
  const handleDeleteDoc = async (docId) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;

    try {
      await axios.delete(`${API_BASE}/api/nurses/${selectedNurse._id}/documents/${docId}`);

      // Update UI immediately
      fetchNurses(user.uid);

      // Update the modal view
      setSelectedNurse(prev => ({
        ...prev,
        documents: prev.documents.filter(d => d._id !== docId)
      }));

    } catch (error) {
      console.error(error);
      alert("Failed to delete document");
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Silver Case Dashboard</h1>
        <button onClick={() => signOut(auth).then(() => navigate('/'))} className="logout-btn">Logout</button>
      </div>

      {/* ANALYTICS CARDS */}
      <div className="analytics-container">
        <div className="analytics-card">
          <h3>Total Staff</h3>
          <p className="analytics-value">{totalStaff}</p>
        </div>
        <div className="analytics-card card-green">
          <h3>Present Today</h3>
          <p className="analytics-value text-green">{presentToday}</p>
        </div>
        <div className="analytics-card card-red">
          <h3>Absent / Inactive</h3>
          <p className="analytics-value text-red">{absentToday}</p>
        </div>
      </div>

      {/* ADD NURSE FORM */}
      <div className="form-card">
        <h3>Add New Staff</h3>
        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '15px' }}>
          Step 1: Add Nurse details. <br />
          Step 2: Ask Nurse to start the Telegram Bot.
        </p>
        <form onSubmit={handleSubmit} className="nurse-form">
          <input className="input-field" placeholder="Name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
          <input className="input-field" placeholder="Phone (e.g. 9999999999)" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} required />
          <input className="input-field" placeholder="Daily Rate (₹)" type="number" value={formData.dailyRate} onChange={e => setFormData({ ...formData, dailyRate: e.target.value })} required />
          <button type="submit" className="add-btn">Add Nurse</button>
        </form>
      </div>

      <input
        type="text"
        className="search-bar"
        placeholder="🔍 Search staff..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <div className="nurse-grid">
        {filteredNurses.map(nurse => (
          <div key={nurse._id} className="nurse-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div className="nurse-header">
                <h2>{nurse.name}</h2>
                <p className="phone-text">{nurse.phone}</p>
              </div>
              <button onClick={() => handleDelete(nurse._id)} className="btn-icon" title="Delete">🗑️</button>
            </div>

            <hr className="divider" />

            {/* Status Indicator */}
            {nurse.telegramChatId ? (
              <div style={{ color: '#28a745', fontSize: '0.85rem', marginBottom: '10px' }}>✅ Linked to Telegram</div>
            ) : (
              <div style={{ color: '#dc3545', fontSize: '0.85rem', marginBottom: '10px' }}>❌ Not Linked yet</div>
            )}

            {/* Latest Log Preview */}
            {nurse.logs && nurse.logs.length > 0 ? (
              <div>
                <div className="status-active">
                  ● Active ({new Date(nurse.logs[nurse.logs.length - 1].time).toLocaleTimeString()})
                </div>
              </div>
            ) : (
              <div className="status-inactive">No activity today</div>
            )}

            <button
              onClick={() => { setSelectedNurse(nurse); setActiveTab('attendance'); }}
              className="view-btn" // Using the new CSS class
            >
              View Profile
            </button>
          </div>
        ))}
      </div>

      {/* --- MODAL --- */}
      {selectedNurse && (
        <div className="modal-overlay" onClick={() => setSelectedNurse(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-modal-btn" onClick={() => setSelectedNurse(null)}>×</button>

            <h2 style={{ marginBottom: '10px' }}>{selectedNurse.name}</h2>

            {/* TABS HEADER */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
              <button
                onClick={() => setActiveTab('attendance')}
                style={{
                  padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem',
                  borderBottom: activeTab === 'attendance' ? '3px solid #333' : 'none',
                  fontWeight: activeTab === 'attendance' ? 'bold' : 'normal',
                  color: activeTab === 'attendance' ? '#333' : '#999'
                }}
              >
                📅 Attendance
              </button>
              <button
                onClick={() => setActiveTab('docs')}
                style={{
                  padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem',
                  borderBottom: activeTab === 'docs' ? '3px solid #333' : 'none',
                  fontWeight: activeTab === 'docs' ? 'bold' : 'normal',
                  color: activeTab === 'docs' ? '#333' : '#999'
                }}
              >
                📂 Documents
              </button>
            </div>

            {/* TAB 1: ATTENDANCE (Calendar + Logs) */}
            {activeTab === 'attendance' && (
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {/* Left: Calendar */}
                <div style={{ flex: 1, minWidth: '300px' }}>
                  <Calendar
                    onChange={setSelectedDate}
                    value={selectedDate}
                    tileClassName={({ date }) => isPresent(date) ? 'present-date' : null}
                  />
                </div>

                {/* Right: Log Details (Scrollable list of ALL logs for that day) */}
                <div style={{ flex: 1, background: '#f8f9fa', padding: '20px', borderRadius: '12px', minWidth: '250px', maxHeight: '400px', overflowY: 'auto' }}>
                  <h4 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
                    {selectedDate.toDateString()}
                  </h4>

                  {/* Filter logs for selected date */}
                  {selectedNurse.logs.filter(log => {
                    const d = new Date(log.time);
                    return d.getDate() === selectedDate.getDate() &&
                      d.getMonth() === selectedDate.getMonth() &&
                      d.getFullYear() === selectedDate.getFullYear();
                  }).length > 0 ? (
                    <div>
                      {selectedNurse.logs.filter(log => {
                        const d = new Date(log.time);
                        return d.getDate() === selectedDate.getDate() &&
                          d.getMonth() === selectedDate.getMonth() &&
                          d.getFullYear() === selectedDate.getFullYear();
                      }).map((log, index) => (
                        <div key={index} style={{ marginBottom: '20px', borderBottom: '1px dashed #ccc', paddingBottom: '10px' }}>
                          <div className="status-active" style={{ marginBottom: '5px', fontSize: '0.85rem' }}>
                            ● Check-in at {new Date(log.time).toLocaleTimeString()}
                          </div>

                          {/* Show Photo */}
                          {log.photoUrl && (
                            <div style={{ marginTop: '5px' }}>
                              <a href={`${API_BASE}${log.photoUrl}`} target="_blank" rel="noreferrer">
                                <img
                                  src={`${API_BASE}${log.photoUrl}`}
                                  alt="Selfie"
                                  style={{ width: '100%', borderRadius: '8px', border: '2px solid #333' }}
                                />
                              </a>
                            </div>
                          )}

                          {/* Show Location */}
                          {log.location && (
                            <div style={{ marginTop: '5px' }}>
                              <a href={`https://www.google.com/maps?q=${log.location}`} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '8px', background: '#e9ecef', textAlign: 'center', borderRadius: '6px', textDecoration: 'none', color: '#333', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                📍 View Location
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', marginTop: '40px', color: '#999' }}>
                      <p style={{ fontSize: '2rem', margin: 0 }}>📅</p>
                      <p>No attendance marked.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: DOCUMENTS (New Feature) */}
            {activeTab === 'docs' && (
              <div>
                {/* Upload Section */}
                <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #eee' }}>
                  <h4 style={{ marginTop: 0 }}>Upload New Document</h4>
                  <form onSubmit={handleFileUpload} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      className="input-field"
                      type="text"
                      placeholder="Document Name (e.g. Aadhar)"
                      value={docName}
                      onChange={e => setDocName(e.target.value)}
                      style={{ flex: 1, minWidth: '150px' }}
                      required
                    />
                    <input
                      type="file"
                      onChange={e => setDocFile(e.target.files[0])}
                      style={{ padding: '10px' }}
                      required
                    />
                    <button type="submit" disabled={uploading} style={{ background: '#111', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>
                      {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                  </form>
                </div>

                {/* Document List */}
                <h4 style={{marginBottom:'15px'}}>Saved Documents</h4>
                    {selectedNurse.documents && selectedNurse.documents.length > 0 ? (
                        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:'15px'}}>
                            {selectedNurse.documents.map((doc) => (
                                <div key={doc._id} style={{border:'1px solid #eee', padding:'15px', borderRadius:'10px', textAlign:'center', background:'#fff', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', position:'relative'}}>
                                    
                                    {/* DELETE BUTTON (Top Right) */}
                                    <button 
                                      onClick={() => handleDeleteDoc(doc._id)}
                                      style={{
                                        position: 'absolute', top: '5px', right: '5px',
                                        background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8rem'
                                      }}
                                      title="Delete Document"
                                    >
                                      ❌
                                    </button>

                                    <div style={{fontSize:'2rem', marginBottom:'5px'}}>📄</div>
                                    <p style={{fontWeight:'bold', margin:'5px 0', fontSize:'0.9rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{doc.name}</p>
                                    
                                    <a href={`${API_BASE}${doc.url}`} target="_blank" rel="noreferrer" style={{color:'#007bff', fontSize:'0.85rem', textDecoration:'none', border:'1px solid #007bff', padding:'2px 8px', borderRadius:'4px', display:'inline-block', marginTop:'5px'}}>
                                        Download
                                    </a>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{textAlign:'center', padding:'30px', color:'#999', border:'1px dashed #ccc', borderRadius:'10px'}}>
                            No documents uploaded yet.
                        </div>
                    )}
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}

export default Dashboard;