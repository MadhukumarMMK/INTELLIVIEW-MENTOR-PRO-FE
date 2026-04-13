import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from '../api/axiosInstance';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { useNotification } from '../context/NotificationContext';
import IntelliLoader from '../components/IntelliLoader';
import './AdminPanel.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

export default function AdminPanel() {
    const notify = useNotification();
    const [activeTab, setActiveTab] = useState('overview');
    const [settings, setSettings] = useState({
        max_interviews: 6, questions_per_session: 3,
        questions_resume: 10, questions_custom: 10, questions_hr: 8,
        session_time_limit: 15, starting_difficulty: 'Medium'
    });
    const [loading, setLoading] = useState(false);

    // Chart data (lightweight summary)
    const [chartData, setChartData] = useState([]);

    // Paginated table state
    const [tableData, setTableData] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 10, totalCount: 0, totalPages: 0 });
    const [searchQuery, setSearchQuery] = useState('');

    // Hierarchy state
    const [technologies, setTechnologies] = useState([]);
    const [modules, setModules] = useState([]);
    const [topics, setTopics] = useState([]);
    const [selectedTech, setSelectedTech] = useState(null);
    const [selectedModule, setSelectedModule] = useState(null);
    const [newItemName, setNewItemName] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [editingItem, setEditingItem] = useState(null);
    const [editName, setEditName] = useState('');

    const switchTab = (tab) => { setActiveTab(tab); };

    // --- Fetch paginated table ---
    const fetchTable = useCallback((page = 1, search = '') => {
        axios.get(`/admin/analytics/interviews?page=${page}&limit=${pagination.limit}&search=${search}`)
            .then(res => {
                setTableData(res.data.interviews || []);
                setPagination(res.data.pagination || { page: 1, limit: 10, totalCount: 0, totalPages: 0 });
            }).catch(console.error);
    }, [pagination.limit]);

    useEffect(() => {
        setLoading(true);
        if (['overview', 'statistics'].includes(activeTab)) {
            Promise.all([
                axios.get('/admin/analytics/summary'),
                axios.get('/admin/settings'),
                axios.get(`/admin/analytics/interviews?page=1&limit=${pagination.limit}`)
            ]).then(([sumRes, setRes, tableRes]) => {
                setChartData(sumRes.data);
                setSettings(prev => ({ ...prev, ...setRes.data }));
                setTableData(tableRes.data.interviews || []);
                setPagination(tableRes.data.pagination || { page: 1, limit: 10, totalCount: 0, totalPages: 0 });
            }).catch(console.error).finally(() => setLoading(false));
        } else if (activeTab === 'users') {
            fetchUsers(1, '');
            axios.get('/admin/settings').then(res => setSettings(prev => ({ ...prev, ...res.data }))).catch(console.error);
            setLoading(false);
        } else if (['question-limits', 'interview-limits'].includes(activeTab)) {
            axios.get('/admin/settings')
                .then(res => setSettings(prev => ({ ...prev, ...res.data })))
                .catch(console.error).finally(() => setLoading(false));
        } else if (activeTab === 'hierarchy') {
            fetchTechnologies();
        } else { setLoading(false); }
    }, [activeTab]);

    // --- Hierarchy fetchers ---
    const fetchTechnologies = () => {
        setLoading(true);
        axios.get('/general/technologies')
            .then(res => { setTechnologies(res.data); setSelectedTech(null); setModules([]); setSelectedModule(null); setTopics([]); })
            .catch(console.error).finally(() => setLoading(false));
    };
    const fetchModules = (techId) => {
        setSelectedTech(techId); setSelectedModule(null); setTopics([]);
        axios.post('/general/modules-by-tech', { technology_id: techId }).then(res => setModules(res.data)).catch(console.error);
    };
    const fetchTopics = (moduleId) => {
        setSelectedModule(moduleId);
        axios.post('/general/topics-by-module', { module_id: moduleId }).then(res => setTopics(res.data)).catch(console.error);
    };

    // --- Hierarchy CRUD ---
    const addTechnology = () => {
        if (!newItemName.trim()) return;
        axios.post('/general/technologies', { technology_name: newItemName, technology_category: newCategory || 'General' })
            .then(() => { setNewItemName(''); setNewCategory(''); fetchTechnologies(); }).catch(() => notify.error('Operation failed'));
    };
    const addModule = () => {
        if (!newItemName.trim() || !selectedTech) return;
        axios.post('/general/modules', { module_name: newItemName, technology: selectedTech })
            .then(() => { setNewItemName(''); fetchModules(selectedTech); }).catch(() => notify.error('Operation failed'));
    };
    const addTopic = () => {
        if (!newItemName.trim() || !selectedModule || !selectedTech) return;
        axios.post('/general/topics', { topic_name: newItemName, module: selectedModule, technology: selectedTech })
            .then(() => { setNewItemName(''); fetchTopics(selectedModule); }).catch(() => notify.error('Operation failed'));
    };
    const deleteItem = async (type, id) => {
        const ok = await notify.confirm(`Delete this ${type}?`, 'Delete');
        if (!ok) return;
        axios.delete(`/general/${type}s/${id}`).then(() => {
            if (type === 'technologie') fetchTechnologies();
            else if (type === 'module') fetchModules(selectedTech);
            else fetchTopics(selectedModule);
        }).catch(() => notify.error('Operation failed'));
    };
    const startEdit = (id, name) => { setEditingItem(id); setEditName(name); };
    const saveEdit = (type, id) => {
        const field = type === 'technologie' ? 'technology_name' : type === 'module' ? 'module_name' : 'topic_name';
        axios.put(`/general/${type}s/${id}`, { [field]: editName }).then(() => {
            setEditingItem(null);
            if (type === 'technologie') fetchTechnologies();
            else if (type === 'module') fetchModules(selectedTech);
            else fetchTopics(selectedModule);
        }).catch(() => notify.error('Operation failed'));
    };

    const handleSaveSettings = async () => {
        try { await axios.put('/admin/settings', settings); notify.success("Settings updated!"); }
        catch { notify.error("Failed to update settings."); }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        fetchTable(1, searchQuery);
    };

    // --- Chart computations ---
    const timeStats = useMemo(() => {
        const now = new Date();
        const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const soy = new Date(sod); soy.setDate(soy.getDate() - 1);
        const sow = new Date(sod); sow.setDate(sow.getDate() - sow.getDay());
        const som = new Date(now.getFullYear(), now.getMonth(), 1);
        const soyr = new Date(now.getFullYear(), 0, 1);
        const avg = arr => arr.length > 0 ? Math.round(arr.reduce((s, i) => s + (i.overall_score || 0), 0) / arr.length) : 0;
        const today = chartData.filter(i => new Date(i.createdAt) >= sod);
        const yesterday = chartData.filter(i => { const d = new Date(i.createdAt); return d >= soy && d < sod; });
        const weekly = chartData.filter(i => new Date(i.createdAt) >= sow);
        const monthly = chartData.filter(i => new Date(i.createdAt) >= som);
        const yearly = chartData.filter(i => new Date(i.createdAt) >= soyr);
        return { today, yesterday, weekly, monthly, yearly, avgToday: avg(today), avgWeekly: avg(weekly), avgMonthly: avg(monthly), avgYearly: avg(yearly) };
    }, [chartData]);

    const monthlyChart = useMemo(() => {
        const m = [], c = [], s = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const ms = new Date(d.getFullYear(), d.getMonth(), 1), me = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            const mi = chartData.filter(inv => { const dt = new Date(inv.createdAt); return dt >= ms && dt < me; });
            m.push(d.toLocaleString('default', { month: 'short' })); c.push(mi.length);
            s.push(mi.length > 0 ? Math.round(mi.reduce((a, b) => a + (b.overall_score || 0), 0) / mi.length) : 0);
        }
        return { m, c, s };
    }, [chartData]);

    const weeklyChart = useMemo(() => {
        const d = [], c = [], s = [];
        for (let i = 6; i >= 0; i--) {
            const dt = new Date(); dt.setDate(dt.getDate() - i);
            const ds = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()), de = new Date(ds); de.setDate(de.getDate() + 1);
            const di = chartData.filter(inv => { const x = new Date(inv.createdAt); return x >= ds && x < de; });
            d.push(dt.toLocaleDateString('default', { weekday: 'short' })); c.push(di.length);
            s.push(di.length > 0 ? Math.round(di.reduce((a, b) => a + (b.overall_score || 0), 0) / di.length) : 0);
        }
        return { d, c, s };
    }, [chartData]);

    const scoreDist = useMemo(() => {
        const b = { Excellent: 0, Good: 0, Average: 0, Poor: 0 };
        chartData.forEach(i => { const s = i.overall_score || 0; if (s >= 80) b.Excellent++; else if (s >= 60) b.Good++; else if (s >= 40) b.Average++; else b.Poor++; });
        return b;
    }, [chartData]);

    const total = chartData.length;
    const users = [...new Set(chartData.map(i => i.roll_no))].length;
    const top = chartData.filter(i => (i.overall_score || 0) >= 80).length;
    const avg = total > 0 ? Math.round(chartData.reduce((s, i) => s + (i.overall_score || 0), 0) / total) : 0;

    const co = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8b949e', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#21262d' } }, y: { ticks: { color: '#8b949e', font: { size: 10 } }, grid: { color: '#21262d' } } } };
    const dOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#8b949e', font: { size: 11 } } } } };

    // Users tab state
    const [usersData, setUsersData] = useState([]);
    const [usersPagination, setUsersPagination] = useState({ page: 1, limit: 20, totalCount: 0, totalPages: 0 });
    const [usersSearch, setUsersSearch] = useState('');
    const [newUser, setNewUser] = useState({ roll_no: '', first_name: '', email: '', college: '', branch: '', passout_year: '' });
    const [bulkUploading, setBulkUploading] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);
    const bulkFileRef = React.createRef();

    const fetchUsers = useCallback((page = 1, search = '') => {
        axios.get(`/admin/users?page=${page}&limit=20&search=${search}`)
            .then(res => { setUsersData(res.data.users || []); setUsersPagination(res.data.pagination || {}); })
            .catch(console.error);
    }, []);

    const handleCreateUser = async () => {
        if (!newUser.roll_no.trim()) return notify.warning("Roll number is required");
        try {
            await axios.post('/admin/users/create', newUser);
            notify.success(`User ${newUser.roll_no} created with default password`);
            setNewUser({ roll_no: '', first_name: '', email: '', college: '', branch: '', passout_year: '' });
            fetchUsers(1, usersSearch);
        } catch (err) {
            notify.error(err.response?.data?.message || "Failed to create user");
        }
    };

    const handleBulkUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setBulkUploading(true);
        setBulkResult(null);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post('/admin/users/bulk-upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setBulkResult(res.data);
            notify.success(res.data.message);
            fetchUsers(1, usersSearch);
        } catch (err) {
            notify.error(err.response?.data?.message || "Bulk upload failed");
        } finally {
            setBulkUploading(false);
            if (bulkFileRef.current) bulkFileRef.current.value = '';
        }
    };

    const handleDeleteUser = async (roll_no) => {
        const ok = await notify.confirm(`Delete user ${roll_no} and all their data?`, "Delete User");
        if (!ok) return;
        try {
            await axios.delete(`/admin/users/${roll_no}`);
            notify.success(`User ${roll_no} deleted`);
            fetchUsers(usersPagination.page, usersSearch);
        } catch (err) { notify.error("Failed to delete user"); }
    };

    const handleResetPassword = async (roll_no) => {
        const ok = await notify.confirm(`Reset password for ${roll_no} to default?`, "Reset Password");
        if (!ok) return;
        try {
            await axios.put(`/admin/users/${roll_no}/reset-password`);
            notify.success(`Password reset for ${roll_no}`);
        } catch (err) { notify.error("Failed to reset password"); }
    };

    const navItems = [
        { id: 'overview', icon: '📊', label: 'Overview' },
        { id: 'users', icon: '👤', label: 'Users' },
        { id: 'question-limits', icon: '❓', label: 'Question Limits' },
        { id: 'interview-limits', icon: '🔒', label: 'Interview Limits' },
        { id: 'hierarchy', icon: '🗂', label: 'Hierarchy' },
        { id: 'statistics', icon: '📈', label: 'Statistics' }
    ];

    // Pagination renderer
    const PaginationBar = () => {
        const { page, totalPages, totalCount } = pagination;
        if (totalPages <= 1) return null;
        const pages = [];
        const start = Math.max(1, page - 2);
        const end = Math.min(totalPages, page + 2);
        for (let i = start; i <= end; i++) pages.push(i);
        return (
            <div className="pagination-bar">
                <span className="pagination-info">{totalCount} results</span>
                <div className="pagination-btns">
                    <button disabled={page <= 1} onClick={() => fetchTable(page - 1, searchQuery)} className="pg-btn">Prev</button>
                    {start > 1 && <><button onClick={() => fetchTable(1, searchQuery)} className="pg-btn">1</button><span className="pg-dots">...</span></>}
                    {pages.map(p => (
                        <button key={p} onClick={() => fetchTable(p, searchQuery)} className={`pg-btn ${p === page ? 'active' : ''}`}>{p}</button>
                    ))}
                    {end < totalPages && <><span className="pg-dots">...</span><button onClick={() => fetchTable(totalPages, searchQuery)} className="pg-btn">{totalPages}</button></>}
                    <button disabled={page >= totalPages} onClick={() => fetchTable(page + 1, searchQuery)} className="pg-btn">Next</button>
                </div>
            </div>
        );
    };

    return (
        <div className="admin-root">
            {/* Top tab bar — scrollable on mobile */}
            <div className="admin-tabbar">
                <div className="admin-tabbar-inner">
                    {navItems.map(item => (
                        <button key={item.id} onClick={() => switchTab(item.id)}
                            className={`admin-tab ${activeTab === item.id ? 'active' : ''}`}>
                            <span className="tab-icon">{item.icon}</span>
                            <span className="tab-label">{item.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main content */}
            <div className="admin-main">

                <div className="admin-content">
                    {loading ? <IntelliLoader message="Loading admin data" size="compact" /> : (
                        <>
                            {/* ========== OVERVIEW ========== */}
                            {activeTab === 'overview' && (
                                <div>
                                    <div className="grid-4">{[
                                        { l: 'Total Users', v: users, c: '#58a6ff' },
                                        { l: 'Interviews', v: total, c: '#d29922' },
                                        { l: 'Avg Score', v: `${avg}%`, c: '#238636' },
                                        { l: 'Top Performers', v: top, c: '#bc8cff' }
                                    ].map((s, i) => <StatCard key={i} label={s.l} value={s.v} color={s.c} />)}</div>

                                    <div className="grid-5">
                                        <TimeCard label="Today" count={timeStats.today.length} avg={timeStats.avgToday} />
                                        <TimeCard label="Yesterday" count={timeStats.yesterday.length} />
                                        <TimeCard label="Week" count={timeStats.weekly.length} avg={timeStats.avgWeekly} />
                                        <TimeCard label="Month" count={timeStats.monthly.length} avg={timeStats.avgMonthly} />
                                        <TimeCard label="Year" count={timeStats.yearly.length} avg={timeStats.avgYearly} />
                                    </div>

                                    <div className="grid-2">
                                        <ChartCard title="Weekly Activity">
                                            <Bar data={{ labels: weeklyChart.d, datasets: [{ label: 'Interviews', data: weeklyChart.c, backgroundColor: 'rgba(88,166,255,0.6)', borderRadius: 4 }] }} options={co} />
                                        </ChartCard>
                                        <ChartCard title="Monthly Trend">
                                            <Line data={{ labels: monthlyChart.m, datasets: [
                                                { label: 'Score', data: monthlyChart.s, borderColor: '#238636', backgroundColor: 'rgba(35,134,54,0.1)', fill: true, tension: 0.4, pointRadius: 3 },
                                                { label: 'Count', data: monthlyChart.c, borderColor: '#58a6ff', backgroundColor: 'rgba(88,166,255,0.1)', fill: true, tension: 0.4, pointRadius: 3 }
                                            ] }} options={co} />
                                        </ChartCard>
                                    </div>

                                    <div className="grid-2">
                                        <div className="a-card">
                                            <h4 className="a-card-title">Quick Settings</h4>
                                            <SettingRow label="Interview Limit" value={settings.max_interviews || 6} />
                                            <SettingRow label="Resume Q" value={settings.questions_resume} />
                                            <SettingRow label="Custom Q" value={settings.questions_custom} />
                                            <SettingRow label="HR Q" value={settings.questions_hr} />
                                            <SettingRow label="Difficulty" value={settings.starting_difficulty} />
                                        </div>
                                        <ChartCard title="Score Distribution">
                                            <Doughnut data={{ labels: Object.keys(scoreDist), datasets: [{ data: Object.values(scoreDist), backgroundColor: ['#238636', '#58a6ff', '#d29922', '#f85149'] }] }} options={dOpts} />
                                        </ChartCard>
                                    </div>
                                </div>
                            )}

                            {/* ========== USERS ========== */}
                            {activeTab === 'users' && (
                                <div>
                                    {/* Default Password Setting */}
                                    <div className="a-card" style={{ marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                                            <div>
                                                <h4 className="a-card-title" style={{ margin: 0 }}>Default Password</h4>
                                                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>New users get this password on creation</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                <input value={settings.default_password || ''} onChange={e => setSettings({ ...settings, default_password: e.target.value })}
                                                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'monospace', width: '180px' }} />
                                                <button onClick={handleSaveSettings} className="btn-save-admin" style={{ width: 'auto', padding: '8px 16px', margin: 0 }}>Save</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid-2">
                                        {/* Single User Registration */}
                                        <div className="a-card">
                                            <h4 className="a-card-title">Add Single User</h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <input placeholder="Roll Number *" value={newUser.roll_no} onChange={e => setNewUser({ ...newUser, roll_no: e.target.value })} className="user-form-input" />
                                                <input placeholder="Full Name" value={newUser.first_name} onChange={e => setNewUser({ ...newUser, first_name: e.target.value })} className="user-form-input" />
                                                <input placeholder="Email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} className="user-form-input" />
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <input placeholder="College" value={newUser.college} onChange={e => setNewUser({ ...newUser, college: e.target.value })} className="user-form-input" style={{ flex: 1 }} />
                                                    <input placeholder="Branch" value={newUser.branch} onChange={e => setNewUser({ ...newUser, branch: e.target.value })} className="user-form-input" style={{ flex: 1 }} />
                                                </div>
                                                <input placeholder="Passout Year" type="number" value={newUser.passout_year} onChange={e => setNewUser({ ...newUser, passout_year: e.target.value })} className="user-form-input" />
                                                <button onClick={handleCreateUser} className="btn-save-admin">Create User</button>
                                            </div>
                                        </div>

                                        {/* Bulk Upload */}
                                        <div className="a-card">
                                            <h4 className="a-card-title">Bulk Upload (Excel)</h4>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
                                                Upload .xlsx file with columns: roll_no, first_name, email, college, branch, passout_year
                                            </p>
                                            <button onClick={() => {
                                                // Generate and download sample Excel
                                                const sampleData = [
                                                    { roll_no: '21A91A0501', first_name: 'John Doe', email: 'john@college.edu', college: 'ABC University', branch: 'CSE', passout_year: 2025 },
                                                    { roll_no: '21A91A0502', first_name: 'Jane Smith', email: 'jane@college.edu', college: 'ABC University', branch: 'ECE', passout_year: 2025 }
                                                ];
                                                import('xlsx').then(XLSX => {
                                                    const ws = XLSX.utils.json_to_sheet(sampleData);
                                                    const wb = XLSX.utils.book_new();
                                                    XLSX.utils.book_append_sheet(wb, ws, 'Users');
                                                    XLSX.writeFile(wb, 'IntelliView_Bulk_Upload_Sample.xlsx');
                                                });
                                            }} className="cert-action-btn download" style={{ marginBottom: '1rem', padding: '8px 16px' }}>
                                                Download Sample Excel
                                            </button>
                                            <div style={{ border: '2px dashed var(--border-color)', borderRadius: '10px', padding: '2rem', textAlign: 'center', cursor: 'pointer' }}
                                                onClick={() => bulkFileRef.current?.click()}>
                                                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                                    {bulkUploading ? 'Uploading...' : 'Click to upload .xlsx file'}
                                                </p>
                                            </div>
                                            <input ref={bulkFileRef} type="file" accept=".xlsx,.xls" hidden onChange={handleBulkUpload} />
                                            {bulkResult && (
                                                <div style={{ marginTop: '1rem', padding: '12px', background: 'var(--success-light)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--success)' }}>
                                                    {bulkResult.created} created, {bulkResult.skipped} skipped (of {bulkResult.total} rows)
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Users Table */}
                                    <div className="a-card table-card" style={{ marginTop: '1rem' }}>
                                        <div className="table-header">
                                            <h4 className="a-card-title">Registered Users ({usersPagination.totalCount || 0})</h4>
                                            <form onSubmit={e => { e.preventDefault(); fetchUsers(1, usersSearch); }} className="search-form">
                                                <input value={usersSearch} onChange={e => setUsersSearch(e.target.value)} placeholder="Search roll no, name, email..." className="search-input" />
                                                <button type="submit" className="search-btn">Search</button>
                                            </form>
                                        </div>
                                        <div className="table-scroll">
                                            <table className="admin-table">
                                                <thead>
                                                    <tr><th>Roll No</th><th>Name</th><th>Email</th><th>College</th><th>Branch</th><th>Year</th><th>Actions</th></tr>
                                                </thead>
                                                <tbody>
                                                    {usersData.map(u => (
                                                        <tr key={u._id}>
                                                            <td className="bold">{u.roll_no}</td>
                                                            <td>{u.first_name || '-'}</td>
                                                            <td>{u.email || '-'}</td>
                                                            <td>{u.college || '-'}</td>
                                                            <td>{u.branch || '-'}</td>
                                                            <td>{u.passout_year || '-'}</td>
                                                            <td>
                                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                                    <button onClick={() => handleResetPassword(u.roll_no)} className="cert-action-btn view" title="Reset to default password">Reset Pwd</button>
                                                                    <button onClick={() => handleDeleteUser(u.roll_no)} className="cert-action-btn del">Delete</button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {usersData.length === 0 && <tr><td colSpan={7} className="empty-row">No users found.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                        {/* Users Pagination */}
                                        {usersPagination.totalPages > 1 && (
                                            <div className="pagination-bar">
                                                <span className="pagination-info">{usersPagination.totalCount} users</span>
                                                <div className="pagination-btns">
                                                    <button disabled={usersPagination.page <= 1} onClick={() => fetchUsers(usersPagination.page - 1, usersSearch)} className="pg-btn">Prev</button>
                                                    {Array.from({ length: Math.min(5, usersPagination.totalPages) }, (_, i) => {
                                                        const p = i + Math.max(1, usersPagination.page - 2);
                                                        if (p > usersPagination.totalPages) return null;
                                                        return <button key={p} onClick={() => fetchUsers(p, usersSearch)} className={`pg-btn ${p === usersPagination.page ? 'active' : ''}`}>{p}</button>;
                                                    })}
                                                    <button disabled={usersPagination.page >= usersPagination.totalPages} onClick={() => fetchUsers(usersPagination.page + 1, usersSearch)} className="pg-btn">Next</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ========== QUESTION LIMITS ========== */}
                            {activeTab === 'question-limits' && (
                                <div className="settings-form">
                                    <p className="a-muted">Set adaptive question counts per mode.</p>
                                    <div className="a-card">
                                        <InputField label="Resume-Based" value={settings.questions_resume} onChange={v => setSettings({ ...settings, questions_resume: parseInt(v) || 0 })} />
                                        <InputField label="Custom Selection" value={settings.questions_custom} onChange={v => setSettings({ ...settings, questions_custom: parseInt(v) || 0 })} />
                                        <InputField label="HR Behavioral" value={settings.questions_hr} onChange={v => setSettings({ ...settings, questions_hr: parseInt(v) || 0 })} />
                                        <InputField label="Starting Difficulty" type="select" value={settings.starting_difficulty} options={['Easy', 'Medium', 'Hard']} onChange={v => setSettings({ ...settings, starting_difficulty: v })} />
                                        <button onClick={handleSaveSettings} className="btn-save-admin">Save Settings</button>
                                    </div>
                                </div>
                            )}

                            {/* ========== INTERVIEW LIMITS ========== */}
                            {activeTab === 'interview-limits' && (
                                <div className="settings-form">
                                    <p className="a-muted">Control maximum completed interviews per user.</p>
                                    <div className="a-card">
                                        <InputField label="Max Interviews Per User" value={settings.max_interviews} onChange={v => setSettings({ ...settings, max_interviews: parseInt(v) || 6 })} />
                                        <button onClick={handleSaveSettings} className="btn-save-admin">Save Settings</button>
                                    </div>
                                </div>
                            )}

                            {/* ========== HIERARCHY ========== */}
                            {activeTab === 'hierarchy' && (
                                <div>
                                    <p className="a-muted">Technology → Module → Topic</p>
                                    <div className="hierarchy-grid">
                                        <HierarchyCol title={`Technologies (${technologies.length})`} items={technologies} nameKey="technology_name"
                                            isSelected={id => selectedTech === id} onSelect={fetchModules}
                                            onAdd={addTechnology} onDelete={id => deleteItem('technologie', id)}
                                            editingItem={editingItem} editName={editName} setEditName={setEditName}
                                            onStartEdit={startEdit} onSaveEdit={id => saveEdit('technologie', id)} onCancelEdit={() => setEditingItem(null)}
                                            newName={!selectedTech ? newItemName : ''} setNewName={v => { setSelectedTech(null); setNewItemName(v); }}
                                            showCategory newCategory={newCategory} setNewCategory={setNewCategory}
                                        />
                                        <HierarchyCol title={`Modules${selectedTech ? ` (${modules.length})` : ''}`} items={selectedTech ? modules : []} nameKey="module_name"
                                            isSelected={id => selectedModule === id} onSelect={fetchTopics}
                                            onAdd={addModule} onDelete={id => deleteItem('module', id)}
                                            editingItem={editingItem} editName={editName} setEditName={setEditName}
                                            onStartEdit={startEdit} onSaveEdit={id => saveEdit('module', id)} onCancelEdit={() => setEditingItem(null)}
                                            newName={selectedTech && !selectedModule ? newItemName : ''} setNewName={v => { setSelectedModule(null); setNewItemName(v); }}
                                            placeholder={!selectedTech ? 'Select a technology first' : null}
                                        />
                                        <HierarchyCol title={`Topics${selectedModule ? ` (${topics.length})` : ''}`} items={selectedModule ? topics : []} nameKey="topic_name"
                                            onAdd={addTopic} onDelete={id => deleteItem('topic', id)}
                                            editingItem={editingItem} editName={editName} setEditName={setEditName}
                                            onStartEdit={startEdit} onSaveEdit={id => saveEdit('topic', id)} onCancelEdit={() => setEditingItem(null)}
                                            newName={selectedModule ? newItemName : ''} setNewName={setNewItemName}
                                            placeholder={!selectedModule ? 'Select a module first' : null}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ========== STATISTICS ========== */}
                            {activeTab === 'statistics' && (
                                <div>
                                    <div className="grid-5">
                                        <TimeCard label="Today" count={timeStats.today.length} avg={timeStats.avgToday} />
                                        <TimeCard label="Yesterday" count={timeStats.yesterday.length} />
                                        <TimeCard label="Week" count={timeStats.weekly.length} avg={timeStats.avgWeekly} />
                                        <TimeCard label="Month" count={timeStats.monthly.length} avg={timeStats.avgMonthly} />
                                        <TimeCard label="Year" count={timeStats.yearly.length} avg={timeStats.avgYearly} />
                                    </div>

                                    <div className="grid-3">
                                        <ChartCard title="Daily (7 Days)">
                                            <Bar data={{ labels: weeklyChart.d, datasets: [{ label: 'Interviews', data: weeklyChart.c, backgroundColor: 'rgba(88,166,255,0.6)', borderRadius: 4 }] }} options={co} />
                                        </ChartCard>
                                        <ChartCard title="Monthly (6 Months)">
                                            <Bar data={{ labels: monthlyChart.m, datasets: [
                                                { label: 'Count', data: monthlyChart.c, backgroundColor: 'rgba(88,166,255,0.6)', borderRadius: 4 },
                                                { label: 'Score', data: monthlyChart.s, backgroundColor: 'rgba(35,134,54,0.6)', borderRadius: 4 }
                                            ] }} options={co} />
                                        </ChartCard>
                                        <ChartCard title="Scores">
                                            <Doughnut data={{ labels: Object.keys(scoreDist), datasets: [{ data: Object.values(scoreDist), backgroundColor: ['#238636', '#58a6ff', '#d29922', '#f85149'] }] }} options={dOpts} />
                                        </ChartCard>
                                    </div>

                                    {/* Search + Paginated Table */}
                                    <div className="a-card table-card">
                                        <div className="table-header">
                                            <h4 className="a-card-title">All Interviews</h4>
                                            <form onSubmit={handleSearch} className="search-form">
                                                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search roll no or tech..." className="search-input" />
                                                <button type="submit" className="search-btn">Search</button>
                                            </form>
                                        </div>
                                        <div className="table-scroll">
                                            <table className="admin-table">
                                                <thead>
                                                    <tr><th>Roll No</th><th>Tech / Level</th><th>Score</th><th>Confidence</th><th>Qs</th><th>Date & Time</th><th>Duration</th></tr>
                                                </thead>
                                                <tbody>
                                                    {tableData.map(inv => {
                                                        const st = new Date(inv.start_date_time || inv.createdAt);
                                                        const en = new Date(inv.updatedAt || inv.createdAt);
                                                        const d = en - st, mm = Math.floor(d / 60000), ss = Math.floor((d % 60000) / 1000);
                                                        return (
                                                            <tr key={inv._id}>
                                                                <td className="bold">{inv.roll_no}</td>
                                                                <td>{inv.technology_name || 'General'} ({inv.level})</td>
                                                                <td style={{ color: scoreColor(inv.overall_score) }}>{Math.round(inv.overall_score || 0)}%</td>
                                                                <td>{Math.round((inv.emotions?.emotions?.neutral || inv.emotions?.neutral || 0) * 100)}%</td>
                                                                <td>{inv.questions_count || '-'}</td>
                                                                <td>{st.toLocaleDateString()} {st.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                                <td>{mm}m {ss}s</td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {tableData.length === 0 && <tr><td colSpan={7} className="empty-row">No interviews found.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                        <PaginationBar />
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ===================== Sub-components =====================

function StatCard({ label, value, color }) {
    return <div className="a-card stat-card"><p className="stat-label">{label}</p><p className="stat-value" style={{ color }}>{value}</p></div>;
}
function TimeCard({ label, count, avg }) {
    return (
        <div className="a-card time-card">
            <p className="time-label">{label}</p>
            <p className="time-count" style={{ color: count > 0 ? '#58a6ff' : '#30363d' }}>{count}</p>
            {avg > 0 && <p className="time-avg">Avg: {avg}%</p>}
        </div>
    );
}
function ChartCard({ title, children }) {
    return <div className="a-card"><h4 className="a-card-title">{title}</h4><div className="chart-box">{children}</div></div>;
}
function SettingRow({ label, value }) {
    return <div className="setting-row"><span>{label}</span><span className="setting-val">{value}</span></div>;
}
function InputField({ label, value, onChange, type = "number", options = [] }) {
    return (
        <div className="input-field">
            <label>{label}</label>
            {type === 'select' ? (
                <select value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>
            ) : (
                <input type={type} value={value} onChange={e => onChange(e.target.value)} />
            )}
        </div>
    );
}

function HierarchyCol({ title, items, nameKey, isSelected, onSelect, onAdd, onDelete, editingItem, editName, setEditName, onStartEdit, onSaveEdit, onCancelEdit, newName, setNewName, showCategory, newCategory, setNewCategory, placeholder }) {
    return (
        <div className="hierarchy-col">
            <div className="hierarchy-header"><h4>{title}</h4></div>
            {placeholder ? <p className="h-empty">{placeholder}</p> : (
                <>
                    <div className="hierarchy-add">
                        <input placeholder="Name..." value={newName} onChange={e => setNewName(e.target.value)} className="h-input" />
                        {showCategory && <input placeholder="Category" value={newCategory} onChange={e => setNewCategory(e.target.value)} className="h-input" />}
                        <button onClick={onAdd} className="h-btn add">Add</button>
                    </div>
                    <div className="hierarchy-list">
                        {items.map(item => (
                            <div key={item._id} className={`h-item ${isSelected?.(item._id) ? 'selected' : ''}`} onClick={() => onSelect?.(item._id)}>
                                {editingItem === item._id ? (
                                    <div className="h-edit-row">
                                        <input value={editName} onChange={e => setEditName(e.target.value)} className="h-input sm" />
                                        <button onClick={() => onSaveEdit(item._id)} className="h-btn save">Save</button>
                                        <button onClick={onCancelEdit} className="h-btn cancel">X</button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="h-item-info">
                                            <span className="h-name">{item[nameKey]}</span>
                                            {item.technology_category && <span className="h-category">{item.technology_category}</span>}
                                        </div>
                                        <div className="h-actions">
                                            <button onClick={e => { e.stopPropagation(); onStartEdit(item._id, item[nameKey]); }} className="h-btn edit">Edit</button>
                                            <button onClick={e => { e.stopPropagation(); onDelete(item._id); }} className="h-btn del">Del</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                        {items.length === 0 && <p className="h-empty">No items yet. Add one above.</p>}
                    </div>
                </>
            )}
        </div>
    );
}

function scoreColor(s) { if (!s) return '#8b949e'; if (s >= 70) return '#238636'; if (s >= 40) return '#d29922'; return '#f85149'; }
