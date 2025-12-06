import { useState, useEffect } from 'react';
import axios from 'axios';
import { auth } from "../firebaseConfig";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { useNavigate } from 'react-router-dom';
import '../css/dashboard.css';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';


function Dashboard() {
  const [user, setUser] = useState(null);
  const [nurses, setNurses] = useState([]);
  const [formData, setFormData] = useState({ name: '', phone: '' });

  // Search & Modal State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNurse, setSelectedNurse] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  // Calculate Stats
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
  const navigate = useNavigate();

  // 1. Auth Check
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

  // 2. Fetch Data (Runs every 5 seconds for live updates)
  const fetchNurses = async (ownerId) => {
    try {
      const res = await axios.get(`http://silvercare-api.onrender.com/api/nurses?ownerId=${ownerId}`);
      setNurses(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (user) {
      const interval = setInterval(() => fetchNurses(user.uid), 5000); // Auto-refresh
      return () => clearInterval(interval);
    }
  }, [user]);

  // 3. Add Nurse
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    try {
      await axios.post('http://silvercare-api.onrender.com/api/nurses', {
        ...formData,
        ownerId: user.uid
      });
      setFormData({ name: '', phone: '' });
      fetchNurses(user.uid);
      alert("Nurse added! Ask her to message the Telegram Bot now.");
    } catch (error) { console.error(error); }
  };

  const handleDelete = async (nurseId) => {
    if (!window.confirm("Delete this nurse?")) return;
    try {
      await axios.delete(`http://silvercare-api.onrender.com/api/nurses/${nurseId}?ownerId=${user.uid}`);
      fetchNurses(user.uid);
    } catch (error) { alert("Failed to delete."); }
  };
  // Check if a date has attendance
  const isPresent = (date) => {
    if (!selectedNurse || !selectedNurse.logs) return false;
    return selectedNurse.logs.some(log => {
      const logDate = new Date(log.time);
      return logDate.getDate() === date.getDate() &&
        logDate.getMonth() === date.getMonth() &&
        logDate.getFullYear() === date.getFullYear();
    });
  };

  // Get the specific log for the clicked date
  const getLogForSelectedDate = () => {
    if (!selectedNurse || !selectedNurse.logs) return null;
    return selectedNurse.logs.find(log => {
      const logDate = new Date(log.time);
      return logDate.getDate() === selectedDate.getDate() &&
        logDate.getMonth() === selectedDate.getMonth() &&
        logDate.getFullYear() === selectedDate.getFullYear();
    });
  };
  // Search Filter
  const filteredNurses = nurses.filter(nurse =>
    nurse.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    nurse.phone.includes(searchQuery)
  );

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Silver Case Dashboard</h1>
        <button onClick={() => signOut(auth).then(() => navigate('/'))} className="logout-btn">Logout</button>
      </div>

      {/* ANALYTICS CARDS */}
      <div className="analytics-container">
        {/* Card 1: Total Staff */}
        <div className="analytics-card">
          <h3>Total Staff</h3>
          <p className="analytics-value">{totalStaff}</p>
        </div>

        {/* Card 2: Present Today */}
        <div className="analytics-card card-green">
          <h3>Present Today</h3>
          <p className="analytics-value text-green">{presentToday}</p>
        </div>

        {/* Card 3: Absent */}
        <div className="analytics-card card-red">
          <h3>Absent / Inactive</h3>
          <p className="analytics-value text-red">{absentToday}</p>
        </div>
      </div>

      <div className="form-card">
        <h3>Add New Staff</h3>
        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '15px' }}>
          Step 1: Add Nurse here. <br />
          Step 2: Ask Nurse to start the Telegram Bot and send her phone number.
        </p>
        <form onSubmit={handleSubmit} className="nurse-form">
          <input className="input-field" placeholder="Name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
          <input className="input-field" placeholder="Phone (e.g. 9999999999)" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} required />
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
              onClick={() => setSelectedNurse(nurse)}
              style={{ width: '100%', marginTop: '15px', padding: '10px', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              View Attendance & Photos
            </button>
          </div>
        ))}
      </div>

      {selectedNurse && (
        <div className="modal-overlay" onClick={() => setSelectedNurse(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <button className="close-modal-btn" onClick={() => setSelectedNurse(null)}>×</button>

            <h2 style={{ marginBottom: '20px' }}>{selectedNurse.name}'s Attendance</h2>

            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {/* 1. LEFT SIDE: CALENDAR */}
              <div style={{ flex: 1, minWidth: '300px' }}>
                <Calendar
                  onChange={setSelectedDate}
                  value={selectedDate}
                  tileClassName={({ date }) => isPresent(date) ? 'present-date' : null}
                />
              </div>

              {/* 2. RIGHT SIDE: DETAILS FOR SELECTED DAY */}
<div style={{flex: 1, background:'#f8f9fa', padding:'20px', borderRadius:'8px', minWidth:'250px', maxHeight:'400px', overflowY:'auto'}}>
    <h4 style={{margin:'0 0 15px 0', borderBottom:'1px solid #ddd', paddingBottom:'10px'}}>
        {selectedDate.toDateString()}
    </h4>

    {/* Get ALL logs for this day, not just the first one */}
    {selectedNurse.logs.filter(log => {
        const d = new Date(log.time);
        return d.getDate() === selectedDate.getDate() &&
               d.getMonth() === selectedDate.getMonth() &&
               d.getFullYear() === selectedDate.getFullYear();
    }).length > 0 ? (
        <div>
            {/* Loop through every log found for this day */}
            {selectedNurse.logs.filter(log => {
                const d = new Date(log.time);
                return d.getDate() === selectedDate.getDate() &&
                       d.getMonth() === selectedDate.getMonth() &&
                       d.getFullYear() === selectedDate.getFullYear();
            }).map((log, index) => (
                <div key={index} style={{marginBottom:'20px', borderBottom:'1px dashed #ccc', paddingBottom:'10px'}}>
                    <div className="status-active" style={{marginBottom:'5px', fontSize:'0.85rem'}}>
                        ● Check-in at {new Date(log.time).toLocaleTimeString()}
                    </div>

                    {/* Show Photo if this log has one */}
                    {log.photoUrl && (
                        <div style={{marginTop:'5px'}}>
                            <a href={`http://silvercare-api.onrender.com${log.photoUrl}`} target="_blank" rel="noreferrer">
                                <img 
                                    src={`http://silvercare-api.onrender.com${log.photoUrl}`} 
                                    alt="Selfie" 
                                    style={{width:'100%', borderRadius:'8px', border:'2px solid #333'}}
                                />
                            </a>
                        </div>
                    )}

                    {/* Show Location if this log has one */}
                    {log.location && (
                        <div style={{marginTop:'5px'}}>
                            <a href={`https://www.google.com/maps?q=${log.location}`} target="_blank" rel="noreferrer" style={{display:'block', padding:'8px', background:'#e9ecef', textAlign:'center', borderRadius:'6px', textDecoration:'none', color:'#333', fontWeight:'bold', fontSize:'0.9rem'}}>
                                📍 View Location
                            </a>
                        </div>
                    )}
                </div>
            ))}
        </div>
    ) : (
        <div style={{textAlign:'center', marginTop:'40px', color:'#999'}}>
            <p style={{fontSize:'2rem', margin:0}}>📅</p>
            <p>No attendance marked.</p>
        </div>
    )}
</div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Dashboard;