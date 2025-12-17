// Change this line:
import { useState, useEffect, useRef } from 'react'; // <--- Added useRefimport axios from 'axios';
import { auth } from "../firebaseConfig";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import '../css/dashboard.css';
import axios from 'axios'; // <--- ADD THIS LINE
// API URL
const API_BASE = "https://silvercare-api.onrender.com";// Default Placeholder Image
const DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/847/847969.png";

function Dashboard() {
  const [user, setUser] = useState(null);
  const [nurses, setNurses] = useState([]);
  const fileInputRef = useRef(null); // <--- Create a reference for the file input
  // Navigation
  const [currentView, setCurrentView] = useState('dashboard');
  const [payrollMonth, setPayrollMonth] = useState(new Date().toISOString().slice(0, 7));

  // Form & UI States
  const [formData, setFormData] = useState({ name: '', phone: '', dailyRate: '' });
  // NEW: State for Profile Picture
  const [profilePicFile, setProfilePicFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNurse, setSelectedNurse] = useState(null); 
  const [activeTab, setActiveTab] = useState('attendance');
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Status List Modal State
  const [statusView, setStatusView] = useState(null); 

  // Doc Upload State
  const [docFile, setDocFile] = useState(null);
  const [docName, setDocName] = useState('');
  const [uploading, setUploading] = useState(false);

  const navigate = useNavigate();

  // --- HELPER: GET LISTS ---
  const getPresentNurses = () => {
    return nurses.filter(n => {
        if (!n.logs || n.logs.length === 0) return false;
        const lastLog = new Date(n.logs[n.logs.length - 1].time);
        const today = new Date();
        return lastLog.getDate() === today.getDate() &&
          lastLog.getMonth() === today.getMonth() &&
          lastLog.getFullYear() === today.getFullYear();
    });
  };

  const getAbsentNurses = () => {
    const presentIds = getPresentNurses().map(n => n._id);
    return nurses.filter(n => !presentIds.includes(n._id));
  };

  // --- STATS ---
  const totalStaff = nurses.length;
  const presentList = getPresentNurses();
  const absentList = getAbsentNurses();
  const presentToday = presentList.length;
  const absentToday = absentList.length;

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
      const interval = setInterval(() => fetchNurses(user.uid), 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // --- HANDLERS ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setUploading(true);

    try {
      if (editingId) {
        // UPDATE (No image update support yet, just text)
        await axios.put(`${API_BASE}/api/nurses/${editingId}`, { ...formData, ownerId: user.uid });
        alert("Updated Successfully! ✅");
        setEditingId(null);
      } else {
        // ADD NEW (With Profile Pic)
        const data = new FormData();
        data.append('name', formData.name);
        data.append('phone', formData.phone);
        data.append('dailyRate', formData.dailyRate);
        data.append('ownerId', user.uid);
        
        if (profilePicFile) {
            data.append('profilePic', profilePicFile);
        }

        await axios.post(`${API_BASE}/api/nurses`, data, {
             headers: { 'Content-Type': 'multipart/form-data' }
        });
        alert("Added Successfully! ✅");
      }
      // Reset Form
      setFormData({ name: '', phone: '', dailyRate: '' });
      setProfilePicFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
      fetchNurses(user.uid);
    } catch (error) { console.error(error); alert("Action failed."); }
    finally { setUploading(false); }
  };

  const handleEditClick = (nurse) => {
    setFormData({ name: nurse.name, phone: nurse.phone, dailyRate: nurse.dailyRate });
    setEditingId(nurse._id);
    setCurrentView('dashboard'); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (nurseId) => {
    if (!window.confirm("Delete this nurse?")) return;
    try {
      await axios.delete(`${API_BASE}/api/nurses/${nurseId}`);
      fetchNurses(user.uid);
    } catch (error) { alert("Failed to delete."); }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!docFile || !selectedNurse) return;
    const data = new FormData();
    data.append('file', docFile);
    data.append('docName', docName || docFile.name);
    setUploading(true);
    try {
        await axios.post(`${API_BASE}/api/nurses/${selectedNurse._id}/documents`, data, { headers: { 'Content-Type': 'multipart/form-data' }});
        alert("Uploaded! ✅");
        setDocFile(null); setDocName('');
        fetchNurses(user.uid);
        const res = await axios.get(`${API_BASE}/api/nurses?ownerId=${user.uid}`);
        setSelectedNurse(res.data.find(n => n._id === selectedNurse._id));
    } catch (error) { console.error(error); alert("Upload failed."); } 
    finally { setUploading(false); }
  };

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm("Delete document?")) return;
    try {
      await axios.delete(`${API_BASE}/api/nurses/${selectedNurse._id}/documents/${docId}`);
      fetchNurses(user.uid);
      setSelectedNurse(prev => ({ ...prev, documents: prev.documents.filter(d => d._id !== docId) }));
    } catch (error) { alert("Failed to delete doc"); }
  };

  // --- PAYROLL HELPERS ---
  const calculateMonthlyPayroll = (nurse) => {
    if (!nurse.logs) return { days: 0, total: 0 };
    const [year, month] = payrollMonth.split('-').map(Number);
    const monthlyLogs = nurse.logs.filter(log => {
      const d = new Date(log.time);
      return d.getFullYear() === year && d.getMonth() === (month - 1);
    });
    const uniqueDays = new Set(monthlyLogs.map(log => new Date(log.time).toDateString())).size;
    const rate = nurse.dailyRate || 0;
    return { days: uniqueDays, total: uniqueDays * rate };
  };

  const exportPayroll = () => { window.print(); };

  const isPresent = (date) => {
    if (!selectedNurse || !selectedNurse.logs) return false;
    return selectedNurse.logs.some(log => {
      const d = new Date(log.time);
      return d.getDate() === date.getDate() && d.getMonth() === date.getMonth();
    });
  };

  // --- HELPER TO OPEN DETAILS FROM LIST ---
  const openDetails = (nurse) => {
    setStatusView(null); 
    setSelectedNurse(nurse); 
    setActiveTab('attendance');
  };

  const filteredNurses = nurses.filter(n => n.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="app-container">
        {/* SIDEBAR */}
        <div className="sidebar">
            <div className="sidebar-header">SILVER CARE</div>
            <div className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}>
                📊 Dashboard
            </div>
            <div className={`nav-item ${currentView === 'payroll' ? 'active' : ''}`} onClick={() => setCurrentView('payroll')}>
                💰 Payroll
            </div>
            <button onClick={() => signOut(auth).then(() => navigate('/'))} className="logout-btn-sidebar">🚪 Logout</button>
        </div>

        {/* MAIN CONTENT */}
        <div className="main-content">
            
            {/* VIEW 1: DASHBOARD */}
            {currentView === 'dashboard' && (
                <>
                    <div className="page-header">
                        <h2>Attendance Dashboard</h2>
                    </div>

                    {/* INTERACTIVE CARDS */}
                    <div className="analytics-container">
                        <div className="analytics-card">
                            <h3>Total Staff</h3>
                            <p className="analytics-value">{totalStaff}</p>
                        </div>
                        
                        <div className="analytics-card card-green clickable-card" onClick={() => setStatusView('present')}>
                            <div style={{display:'flex', justifyContent:'space-between'}}><h3>Present Today</h3><span>👆 View List</span></div>
                            <p className="analytics-value text-green">{presentToday}</p>
                        </div>

                        <div className="analytics-card card-red clickable-card" onClick={() => setStatusView('absent')}>
                            <div style={{display:'flex', justifyContent:'space-between'}}><h3>Absent Today</h3><span>👆 View List</span></div>
                            <p className="analytics-value text-red">{absentToday}</p>
                        </div>

                        <div className="analytics-card clickable-card" onClick={() => setCurrentView('payroll')} style={{borderLeft:'5px solid #007bff'}}>
                             <div style={{display:'flex', justifyContent:'space-between'}}><h3>Monthly Reports</h3><span>📥 Download</span></div>
                            <p className="analytics-value" style={{color:'#007bff'}}>View</p>
                        </div>
                    </div>

                    {/* FORM WITH FILE UPLOAD */}
                    <div className="form-card">
                        <h3>{editingId ? "Edit Staff Details" : "Add New Staff"}</h3>
                        <form onSubmit={handleSubmit} className="nurse-form" style={{alignItems:'flex-end'}}>
                            <input className="input-field" placeholder="Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                            <input className="input-field" placeholder="Phone" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} required />
                            <input className="input-field" placeholder="Daily Rate (₹)" type="number" value={formData.dailyRate} onChange={e => setFormData({...formData, dailyRate: e.target.value})} required />
                            
                            {/* Profile Pic Input */}
{!editingId && (
    <div style={{flex:1, minWidth:'150px'}}>
        <label style={{fontSize:'0.8rem', fontWeight:'bold', display:'block', marginBottom:'5px'}}>Profile Pic (Optional)</label>
        
        {/* ✅ ADD ref={fileInputRef} HERE: */}
        <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={e => setProfilePicFile(e.target.files[0])} 
            className="input-field" 
            style={{padding:'7px'}} 
        />
    </div>
)}

                            <button type="submit" className="add-btn" style={{background: editingId ? '#007bff' : '#111'}} disabled={uploading}>
                                {uploading ? 'Saving...' : (editingId ? "Update" : "Add Nurse")}
                            </button>
                            {editingId && <button type="button" onClick={() => {setEditingId(null); setFormData({name:'', phone:'', dailyRate:''}); setProfilePicFile(null)}} style={{padding:'0 15px', border:'none', background:'#ccc', borderRadius:'8px', cursor:'pointer', marginLeft:'10px', height:'42px'}}>Cancel</button>}
                        </form>
                    </div>

                    <input className="search-bar" placeholder="🔍 Search staff..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />

                    {/* GRID WITH IMAGES */}
                    <div className="nurse-grid">
                        {filteredNurses.map(nurse => (
                        <div key={nurse._id} className="nurse-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                
                                <div style={{display:'flex', gap:'15px', alignItems:'center'}}>
                                    <img 
                                        src={nurse.profilePicUrl ? `${API_BASE}${nurse.profilePicUrl}` : DEFAULT_AVATAR} 
                                        alt={nurse.name} 
                                        style={{width:'60px', height:'60px', borderRadius:'50%', objectFit:'cover', border:'2px solid #eee'}}
                                    />
                                    <div className="nurse-header">
                                        <h2>{nurse.name}</h2>
                                        <p className="phone-text">{nurse.phone}</p>
                                        <p className="rate-text">Rate: ₹{nurse.dailyRate}/day</p>
                                    </div>
                                </div>

                                <div style={{display:'flex', gap:'5px'}}>
                                    <button onClick={() => handleEditClick(nurse)} className="btn-icon" title="Edit">✏️</button>
                                    <button onClick={() => handleDelete(nurse._id)} className="btn-icon" title="Delete">🗑️</button>
                                </div>
                            </div>
                            <hr className="divider" />
                            {nurse.telegramChatId ? <div style={{ color: '#28a745', fontSize: '0.85rem' }}>✅ Linked</div> : <div style={{ color: '#dc3545', fontSize: '0.85rem' }}>❌ Not Linked</div>}
                            <button onClick={() => openDetails(nurse)} className="view-btn">View Profile</button>
                        </div>
                        ))}
                    </div>
                </>
            )}

            {/* VIEW 2: PAYROLL */}
            {currentView === 'payroll' && (
                <>
                    <div className="page-header">
                        <h2>Monthly Payroll</h2>
                        <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                            <select className="input-field" style={{minWidth:'120px', fontWeight:'bold', cursor:'pointer'}} value={payrollMonth.split('-')[1]} onChange={(e) => setPayrollMonth(`${payrollMonth.split('-')[0]}-${e.target.value}`)}>
                                {['01','02','03','04','05','06','07','08','09','10','11','12'].map((m, i) => <option key={m} value={m}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>)}
                            </select>
                            <select className="input-field" style={{minWidth:'100px', fontWeight:'bold', cursor:'pointer'}} value={payrollMonth.split('-')[0]} onChange={(e) => setPayrollMonth(`${e.target.value}-${payrollMonth.split('-')[1]}`)}>
                                <option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option>
                            </select>
                            <button onClick={exportPayroll} className="export-btn">📥 Download Report</button>
                        </div>
                    </div>
                    <div className="form-card" style={{padding:'0', overflow:'hidden'}}>
                        <table className="payroll-table">
                            <thead><tr><th>Staff Name</th><th>Daily Rate</th><th>Days Worked</th><th>Total Salary</th><th>Details</th></tr></thead>
                            <tbody>
                                {filteredNurses.map(nurse => {
                                    const { days, total } = calculateMonthlyPayroll(nurse);
                                    return (
                                        <tr key={nurse._id} className="payroll-row">
                                            <td style={{fontWeight:'bold', cursor:'pointer', color:'#007bff', display:'flex', alignItems:'center', gap:'10px'}} onClick={() => openDetails(nurse)}>
                                                <img src={nurse.profilePicUrl ? `${API_BASE}${nurse.profilePicUrl}` : DEFAULT_AVATAR} style={{width:'30px', height:'30px', borderRadius:'50%', objectFit:'cover'}}/>
                                                {nurse.name}
                                            </td>
                                            <td>₹{nurse.dailyRate}</td>
                                            <td>{days} Days</td>
                                            <td className="total-amount">₹{total}</td>
                                            <td><button onClick={() => openDetails(nurse)} style={{background: '#111', color: '#fff', padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600'}}>View Calendar</button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {filteredNurses.length === 0 && <p style={{padding:'30px', textAlign:'center', color:'#999'}}>No staff found.</p>}
                    </div>
                </>
            )}
        </div>

        {/* --- MODAL 1: STATUS LIST (With Images) --- */}
        {statusView && (
            <div className="modal-overlay" onClick={() => setStatusView(null)}>
                <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:'500px'}}>
                    <button className="close-modal-btn" onClick={() => setStatusView(null)}>×</button>
                    <h2 style={{ marginBottom: '20px', color: statusView === 'present' ? '#28a745' : '#dc3545' }}>
                        {statusView === 'present' ? `Present Staff (${presentList.length})` : `Absent Staff (${absentList.length})`}
                    </h2>
                    
                    <div style={{maxHeight:'60vh', overflowY:'auto'}}>
                        {(statusView === 'present' ? presentList : absentList).map(nurse => (
                            <div key={nurse._id} style={{padding:'15px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                                    <img src={nurse.profilePicUrl ? `${API_BASE}${nurse.profilePicUrl}` : DEFAULT_AVATAR} style={{width:'50px', height:'50px', borderRadius:'50%', objectFit:'cover'}}/>
                                    <div><div style={{fontWeight:'bold', fontSize:'1.1rem'}}>{nurse.name}</div><div style={{color:'#666', fontSize:'0.9rem'}}>{nurse.phone}</div></div>
                                </div>
                                {statusView === 'present' ? (
                                    <div style={{textAlign:'right'}}>
                                        <div style={{fontSize:'0.85rem', background:'#d4edda', padding:'3px 8px', borderRadius:'10px', color:'#155724'}}>
                                            {new Date(nurse.logs[nurse.logs.length-1].time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </div>
                                        <button onClick={() => openDetails(nurse)} style={{fontSize:'0.8rem', color:'#007bff', background:'none', border:'none', cursor:'pointer', marginTop:'5px', textDecoration:'underline'}}>View Photo</button>
                                    </div>
                                ) : (
                                    <a href={`tel:${nurse.phone}`} style={{background:'#111', color:'white', textDecoration:'none', padding:'8px 12px', borderRadius:'6px', fontSize:'0.9rem'}}>
                                        📞 Call
                                    </a>
                                )}
                            </div>
                        ))}

                        {(statusView === 'present' ? presentList : absentList).length === 0 && (
                            <p style={{textAlign:'center', color:'#999', padding:'20px'}}>List is empty.</p>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* --- MODAL 2: FULL PROFILE (With Large Image) --- */}
        {selectedNurse && (
            <div className="modal-overlay" onClick={() => setSelectedNurse(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="close-modal-btn" onClick={() => setSelectedNurse(null)}>×</button>
                
                {/* Header with Image */}
                <div style={{display:'flex', alignItems:'center', gap:'20px', marginBottom:'20px'}}>
                      <img src={selectedNurse.profilePicUrl ? `${API_BASE}${selectedNurse.profilePicUrl}` : DEFAULT_AVATAR} style={{width:'80px', height:'80px', borderRadius:'50%', objectFit:'cover', border:'3px solid #eee'}}/>
                     <h2 style={{ margin: 0 }}>{selectedNurse.name}</h2>
                </div>

                <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                  <button onClick={() => setActiveTab('attendance')} style={{ padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', borderBottom: activeTab === 'attendance' ? '3px solid #000' : 'none', fontWeight: activeTab === 'attendance' ? 'bold' : 'normal', color: '#000' }}>📅 Attendance</button>
                  <button onClick={() => setActiveTab('docs')} style={{ padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', borderBottom: activeTab === 'docs' ? '3px solid #000' : 'none', fontWeight: activeTab === 'docs' ? 'bold' : 'normal', color: '#000' }}>📂 Documents</button>
                </div>
                {activeTab === 'attendance' && (
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '300px' }}>
                        <Calendar onChange={setSelectedDate} value={selectedDate} tileClassName={({ date }) => isPresent(date) ? 'present-date' : null} />
                    </div>
                    <div style={{flex: 1, background:'#f8f9fa', padding:'20px', borderRadius:'12px', minWidth:'250px', maxHeight:'400px', overflowY:'auto'}}>
                        <h4 style={{margin:'0 0 15px 0'}}>{selectedDate.toDateString()}</h4>
                        {selectedNurse.logs.filter(log => new Date(log.time).toDateString() === selectedDate.toDateString()).map((log, idx) => (
                                <div key={idx} style={{marginBottom:'20px', borderBottom:'1px dashed #ccc'}}>
                                    <div className="status-active">● Check-in: {new Date(log.time).toLocaleTimeString()}</div>
                                    {log.photoUrl && <a href={`${API_BASE}${log.photoUrl}`} target="_blank"><img src={`${API_BASE}${log.photoUrl}`} style={{width:'100%', borderRadius:'8px', marginTop:'5px'}}/></a>}
                                    {log.location && <a href={`https://www.google.com/maps?q=${log.location}`} target="_blank" style={{display:'block', padding:'8px', background:'#e9ecef', textAlign:'center', marginTop:'5px', borderRadius:'6px', textDecoration:'none', color:'#333'}}>📍 View Location</a>}
                                </div>
                        ))}
                         {selectedNurse.logs.filter(log => new Date(log.time).toDateString() === selectedDate.toDateString()).length === 0 && <p style={{color:'#999'}}>No attendance.</p>}
                    </div>
                    </div>
                )}
                {activeTab === 'docs' && (
                    <div>
                        <form onSubmit={handleFileUpload} style={{background:'#f9f9f9', padding:'20px', borderRadius:'10px', marginBottom:'20px', display:'flex', gap:'10px', flexWrap:'wrap'}}>
                            <input className="input-field" placeholder="Doc Name" value={docName} onChange={e => setDocName(e.target.value)} required />
                            <input type="file" onChange={e => setDocFile(e.target.files[0])} required />
                            <button type="submit" disabled={uploading} style={{background:'#111', color:'white', border:'none', padding:'10px 20px', borderRadius:'6px', cursor:'pointer'}}>Upload</button>
                        </form>
                        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:'15px'}}>
                            {selectedNurse.documents && selectedNurse.documents.map((doc) => (
                                <div key={doc._id} style={{border:'1px solid #eee', padding:'15px', borderRadius:'10px', textAlign:'center', position:'relative', background:'#fff'}}>
                                    <button onClick={() => handleDeleteDoc(doc._id)} style={{position:'absolute', top:5, right:5, border:'none', background:'none', cursor:'pointer', fontSize:'0.8rem'}}>❌</button>
                                    <div style={{fontSize:'2rem'}}>📄</div>
                                    <p style={{fontSize:'0.9rem', margin:'5px 0', overflow:'hidden', textOverflow:'ellipsis'}}>{doc.name}</p>
                                    <a href={`${API_BASE}${doc.url}`} target="_blank" style={{color:'#007bff', fontSize:'0.85rem'}}>Download</a>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            </div>
        )}
    </div>
  );
}

export default Dashboard;