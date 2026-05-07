import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import axios from '../api/axiosInstance';
import { useSearchParams } from 'react-router-dom';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import {
    LayoutDashboard, Users, HelpCircle, Lock, FolderTree, LineChart as LineChartIcon,
    Minus, Plus, Download, Trash2, KeyRound, Trophy, FileText, Target, UserRound,
    ArrowUpDown, Search, X as XIcon, UserCog, LayoutGrid, List as ListIcon
} from 'lucide-react';
import { SERVER_URL, buildShareUrl } from '../api/config';
import { useNotification } from '../context/NotificationContext';
import { ThemeContext } from '../context/ThemeContext';
import IntelliLoader from '../components/IntelliLoader';
import Pagination from '../components/Pagination';
import ShareMenu from '../components/ShareMenu';
import './AdminPanel.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

const VALID_TABS = ['overview', 'user-admin', 'directory', 'limits', 'hierarchy', 'statistics'];
// Legacy tab IDs that redirect to the new merged / renamed tabs
const LEGACY_TAB_REDIRECTS = {
    'question-limits': 'limits',
    'interview-limits': 'limits',
    'users': 'directory' // old combined Users tab → Directory (admin actions now at user-admin)
};

export default function AdminPanel() {
    const notify = useNotification();
    const { isDarkMode } = useContext(ThemeContext);
    const [searchParams, setSearchParams] = useSearchParams();
    // Initial tab from URL (?tab=users) so refresh preserves the tab.
    // Legacy tab IDs (question-limits / interview-limits) route to the merged 'limits' tab.
    const rawTab = searchParams.get('tab');
    const redirected = LEGACY_TAB_REDIRECTS[rawTab];
    const initialTab = redirected || (VALID_TABS.includes(rawTab) ? rawTab : 'overview');
    const [activeTab, setActiveTab] = useState(initialTab);
    const [settings, setSettings] = useState({
        max_interviews: 6, questions_per_session: 3,
        questions_resume: 10, questions_custom: 10, questions_hr: 8,
        time_per_question_resume: 60, time_per_question_custom: 60, time_per_question_hr: 60,
        session_time_limit: 15, starting_difficulty: 'Medium',
        expo_mode: false
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

    const switchTab = (tab) => {
        setActiveTab(tab);
        setSearchParams({ tab }, { replace: true });
    };

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
        } else if (activeTab === 'directory') {
            // User Directory — needs user list + facets; the debounced search
            // effect below fires on mount too, so just ensure facets load.
            setLoading(false);
        } else if (activeTab === 'user-admin') {
            axios.get('/admin/settings')
                .then(res => setSettings(prev => ({ ...prev, ...res.data })))
                .catch(console.error).finally(() => setLoading(false));
        } else if (activeTab === 'limits') {
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
        if (!newItemName.trim()) return notify.warning('Technology name is required');
        axios.post('/general/technologies', { technology_name: newItemName, technology_category: newCategory || 'General' })
            .then(() => {
                notify.success(`Technology "${newItemName}" added`);
                setNewItemName(''); setNewCategory(''); fetchTechnologies();
            }).catch(() => notify.error('Failed to add technology'));
    };
    const addModule = () => {
        if (!newItemName.trim() || !selectedTech) return notify.warning('Select a technology and enter a module name');
        axios.post('/general/modules', { module_name: newItemName, technology: selectedTech })
            .then(() => {
                notify.success(`Module "${newItemName}" added`);
                setNewItemName(''); fetchModules(selectedTech);
            }).catch(() => notify.error('Failed to add module'));
    };
    const addTopic = () => {
        if (!newItemName.trim() || !selectedModule || !selectedTech) return notify.warning('Select a module and enter a topic name');
        axios.post('/general/topics', { topic_name: newItemName, module: selectedModule, technology: selectedTech })
            .then(() => {
                notify.success(`Topic "${newItemName}" added`);
                setNewItemName(''); fetchTopics(selectedModule);
            }).catch(() => notify.error('Failed to add topic'));
    };
    const deleteItem = async (type, id) => {
        const label = type === 'technologie' ? 'technology' : type;
        const ok = await notify.confirm(`Delete this ${label}? This cannot be undone.`, `Delete ${label}`);
        if (!ok) return;
        axios.delete(`/general/${type}s/${id}`).then(() => {
            notify.success(`${label.charAt(0).toUpperCase() + label.slice(1)} deleted`);
            if (type === 'technologie') fetchTechnologies();
            else if (type === 'module') fetchModules(selectedTech);
            else fetchTopics(selectedModule);
        }).catch(() => notify.error(`Failed to delete ${label}`));
    };
    const startEdit = (id, name) => { setEditingItem(id); setEditName(name); };
    const saveEdit = (type, id) => {
        if (!editName.trim()) return notify.warning('Name cannot be empty');
        const label = type === 'technologie' ? 'technology' : type;
        const field = type === 'technologie' ? 'technology_name' : type === 'module' ? 'module_name' : 'topic_name';
        axios.put(`/general/${type}s/${id}`, { [field]: editName }).then(() => {
            notify.success(`${label.charAt(0).toUpperCase() + label.slice(1)} updated`);
            setEditingItem(null);
            if (type === 'technologie') fetchTechnologies();
            else if (type === 'module') fetchModules(selectedTech);
            else fetchTopics(selectedModule);
        }).catch(() => notify.error(`Failed to update ${label}`));
    };

    const handleSaveSettings = async () => {
        try { await axios.put('/admin/settings', settings); notify.success("Settings updated!"); }
        catch { notify.error("Failed to update settings."); }
    };

    // Auto-save the Expo Mode toggle the moment the admin flips it — no need
    // to also click "Save All Settings". Other settings (numeric steppers,
    // dropdowns) still save via the bottom bar; only this one boolean is
    // instant-save because it has live consequences for visitors.
    const handleExpoToggle = async (checked) => {
        const prev = settings.expo_mode;
        setSettings(s => ({ ...s, expo_mode: checked })); // optimistic flip
        try {
            await axios.put('/admin/settings', { ...settings, expo_mode: checked });
            notify.success(checked ? "Expo Mode is now ON." : "Expo Mode is now OFF.");
        } catch {
            // Revert on failure so the UI reflects the actual server state
            setSettings(s => ({ ...s, expo_mode: prev }));
            notify.error("Couldn't update Expo Mode. Please try again.");
        }
    };

    const handleCancelSettings = async () => {
        try {
            const res = await axios.get('/admin/settings');
            setSettings(prev => ({ ...prev, ...res.data }));
            notify.info("Changes discarded.");
        } catch {
            notify.error("Could not reload settings.");
        }
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

    // Theme-aware chart colors — Chart.js can't resolve CSS vars, so we compute from current theme
    const tickColor = isDarkMode ? '#94a3b8' : '#4a6fa5';
    const gridColor = isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(74, 111, 165, 0.15)';
    const legendColor = isDarkMode ? '#e2e8f0' : '#0a1628';

    // Smooth entrance animation for all charts — bars/lines grow from 0 to final value
    const animation = {
        duration: 1200,
        easing: 'easeOutQuart',
        // For bar charts, animate the y value from 0 upward
        animations: {
            y: { from: 0 },
            tension: { duration: 1000, easing: 'easeOutQuart', from: 1, to: 0, loop: false }
        }
    };

    const co = {
        responsive: true, maintainAspectRatio: false,
        animation,
        plugins: { legend: { labels: { color: legendColor, font: { size: 11 } } } },
        scales: {
            x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } },
            y: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } }
        }
    };
    const dOpts = {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 1400, easing: 'easeOutQuart', animateRotate: true, animateScale: true },
        plugins: { legend: { position: 'bottom', labels: { color: legendColor, font: { size: 11 } } } }
    };

    // Users tab state
    const [usersData, setUsersData] = useState([]);
    const [usersPagination, setUsersPagination] = useState({ page: 1, limit: 10, totalCount: 0, totalPages: 0 });
    const [usersSearch, setUsersSearch] = useState('');
    const [usersFilters, setUsersFilters] = useState({
        college: '',
        branch: '',
        startDate: '',
        endDate: '',
        sortBy: 'created_at',
        sortOrder: 'desc'
    });
    const [userFacets, setUserFacets] = useState({ colleges: [], branches: [] });
    // User Directory view mode — list (default for density) or grid (rich cards)
    const [userViewMode, setUserViewMode] = useState(() => {
        return localStorage.getItem('admin_user_view') || 'list';
    });
    React.useEffect(() => {
        localStorage.setItem('admin_user_view', userViewMode);
    }, [userViewMode]);
    const [newUser, setNewUser] = useState({ roll_no: '', first_name: '', email: '', college: '', branch: '', passout_year: '' });
    const [bulkUploading, setBulkUploading] = useState(false);
    const [bulkResult, setBulkResult] = useState(null);
    const bulkFileRef = React.createRef();

    const fetchUsers = useCallback((page = 1, search = '', filters = usersFilters) => {
        const params = new URLSearchParams({
            page: String(page),
            limit: '10',
            search: search || '',
            college: filters.college || '',
            branch: filters.branch || '',
            startDate: filters.startDate || '',
            endDate: filters.endDate || '',
            sortBy: filters.sortBy || 'created_at',
            sortOrder: filters.sortOrder || 'desc'
        });
        return axios.get(`/admin/users?${params.toString()}`)
            .then(res => { setUsersData(res.data.users || []); setUsersPagination(res.data.pagination || {}); })
            .catch(err => { console.error(err); throw err; });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced server-side search (fires 350ms after user stops typing)
    useEffect(() => {
        if (activeTab !== 'directory') return;
        const t = setTimeout(() => { fetchUsers(1, usersSearch, usersFilters); }, 350);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [usersSearch, usersFilters, activeTab]);

    // Fetch filter facets once when user enters Users tab
    useEffect(() => {
        if (activeTab !== 'directory') return;
        if (userFacets.colleges.length || userFacets.branches.length) return;
        axios.get('/admin/users/filter-facets')
            .then(res => setUserFacets(res.data || { colleges: [], branches: [] }))
            .catch(console.error);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

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

    const handleDownloadResume = async (roll_no) => {
        try {
            const res = await axios.get(`/admin/users/${roll_no}/resume`, { responseType: 'blob' });
            const blob = new Blob([res.data]);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `resume_${roll_no}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            notify.warning(err.response?.data?.message || "No resume on file for this user.");
        }
    };

    const resetUserFilters = () => {
        setUsersSearch('');
        setUsersFilters({ college: '', branch: '', startDate: '', endDate: '', sortBy: 'created_at', sortOrder: 'desc' });
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
        { id: 'overview', Icon: LayoutDashboard, label: 'Overview' },
        { id: 'directory', Icon: Users, label: 'User Directory' },
        { id: 'user-admin', Icon: UserCog, label: 'User Admin' },
        { id: 'limits', Icon: Lock, label: 'Limits & Settings' },
        { id: 'hierarchy', Icon: FolderTree, label: 'Hierarchy' },
        { id: 'statistics', Icon: LineChartIcon, label: 'Statistics' }
    ];

    // Interviews table pagination — server-side, owned by backend response
    const PaginationBar = () => (
        <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalCount}
            pageSize={pagination.limit}
            onPageChange={(p) => fetchTable(p, searchQuery)}
        />
    );

    return (
        <div className="admin-root">
            {/* Top tab bar — scrollable on mobile */}
            <div className="admin-tabbar">
                <div className="admin-tabbar-inner">
                    {navItems.map(item => {
                        const Icon = item.Icon;
                        return (
                            <button key={item.id} onClick={() => switchTab(item.id)}
                                className={`admin-tab ${activeTab === item.id ? 'active' : ''}`}>
                                <span className="tab-icon"><Icon size={18} strokeWidth={2} /></span>
                                <span className="tab-label">{item.label}</span>
                            </button>
                        );
                    })}
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
                                        { l: 'Total Users', v: users, c: 'var(--primary)' },
                                        { l: 'Interviews', v: total, c: 'var(--warning)' },
                                        { l: 'Avg Score', v: avg, c: 'var(--success)', suffix: '%' },
                                        { l: 'Top Performers', v: top, c: 'var(--accent)' }
                                    ].map((s, i) => <StatCard key={i} label={s.l} value={s.v} color={s.c} suffix={s.suffix} />)}</div>

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

                            {/* ========== USER ADMIN (create, bulk, default password) ========== */}
                            {activeTab === 'user-admin' && (
                                <div className="user-admin-layout">
                                    {/* Default Password — top strip */}
                                    <div className="a-card ua-default-pwd">
                                        <div className="ua-pwd-info">
                                            <h4 className="a-card-title">Default Password</h4>
                                            <p className="ua-helper">Every new user is created with this password. They can change it from their Profile.</p>
                                        </div>
                                        <div className="ua-pwd-control">
                                            <input
                                                value={settings.default_password || ''}
                                                onChange={e => setSettings({ ...settings, default_password: e.target.value })}
                                                className="ua-pwd-input"
                                                placeholder="••••••••"
                                            />
                                            <button onClick={handleSaveSettings} className="btn-save-admin">Save</button>
                                        </div>
                                    </div>

                                    <div className="grid-2 ua-grid">
                                        {/* Single User Registration */}
                                        <div className="a-card ua-card-form">
                                            <header className="ua-card-head">
                                                <h4 className="a-card-title">Add Single User</h4>
                                                <p className="ua-helper">Quickly create one user. The default password is assigned automatically.</p>
                                            </header>

                                            <div className="ua-form">
                                                <div className="ua-field">
                                                    <label>Roll Number <span className="ua-req">*</span></label>
                                                    <input placeholder="e.g. 21A91A0501" value={newUser.roll_no} onChange={e => setNewUser({ ...newUser, roll_no: e.target.value })} className="user-form-input" />
                                                </div>
                                                <div className="ua-field">
                                                    <label>Full Name</label>
                                                    <input placeholder="John Doe" value={newUser.first_name} onChange={e => setNewUser({ ...newUser, first_name: e.target.value })} className="user-form-input" />
                                                </div>
                                                <div className="ua-field">
                                                    <label>Email</label>
                                                    <input placeholder="john@college.edu" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} className="user-form-input" />
                                                </div>
                                                <div className="ua-field-row">
                                                    <div className="ua-field">
                                                        <label>College</label>
                                                        <input placeholder="ABC University" value={newUser.college} onChange={e => setNewUser({ ...newUser, college: e.target.value })} className="user-form-input" />
                                                    </div>
                                                    <div className="ua-field">
                                                        <label>Branch</label>
                                                        <input placeholder="CSE" value={newUser.branch} onChange={e => setNewUser({ ...newUser, branch: e.target.value })} className="user-form-input" />
                                                    </div>
                                                </div>
                                                <div className="ua-field">
                                                    <label>Passout Year</label>
                                                    <input type="number" placeholder="2025" value={newUser.passout_year} onChange={e => setNewUser({ ...newUser, passout_year: e.target.value })} className="user-form-input" />
                                                </div>
                                            </div>

                                            <div className="ua-card-footer">
                                                <button onClick={handleCreateUser} className="btn-save-admin">Create User</button>
                                            </div>
                                        </div>

                                        {/* Bulk Upload */}
                                        <div className="a-card ua-card-bulk">
                                            <header className="ua-card-head">
                                                <h4 className="a-card-title">Bulk Upload Users</h4>
                                                <p className="ua-helper">
                                                    Upload an .xlsx file with columns: <code>roll_no</code>, <code>first_name</code>, <code>email</code>, <code>college</code>, <code>branch</code>, <code>passout_year</code>.
                                                </p>
                                            </header>

                                            <button
                                                className="ua-sample-btn"
                                                onClick={() => {
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
                                                }}
                                            >
                                                <Download size={14} strokeWidth={2} /> Download Sample Excel
                                            </button>

                                            <button
                                                className="ua-dropzone"
                                                onClick={() => bulkFileRef.current?.click()}
                                                disabled={bulkUploading}
                                                type="button"
                                            >
                                                <FileText size={28} strokeWidth={1.5} />
                                                <span className="ua-dropzone-title">
                                                    {bulkUploading ? 'Uploading…' : 'Click to upload .xlsx file'}
                                                </span>
                                                <span className="ua-dropzone-hint">
                                                    Excel files only · Max ~5,000 users
                                                </span>
                                            </button>
                                            <input ref={bulkFileRef} type="file" accept=".xlsx,.xls" hidden onChange={handleBulkUpload} />

                                            {bulkResult && (
                                                <div className="ua-bulk-result">
                                                    <strong>{bulkResult.created}</strong> created · <strong>{bulkResult.skipped}</strong> skipped (of {bulkResult.total} rows)
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>
                            )}

                            {/* ========== USER DIRECTORY (search, filters, rich cards) ========== */}
                            {activeTab === 'directory' && (
                                <div>
                                    <div className="user-directory" style={{ marginTop: '0' }}>
                                        <div className="user-directory-head">
                                            <div>
                                                <h3 className="ud-title">User Directory <span className="ud-count">{usersPagination.totalCount || 0}</span></h3>
                                                <p className="ud-subtitle">Search, filter, and review every student's performance at a glance.</p>
                                            </div>
                                        </div>

                                        {/* Filter toolbar — all server-side */}
                                        <div className="user-filter-bar">
                                            <div className="ud-search">
                                                <Search size={16} strokeWidth={2} className="ud-search-icon" />
                                                <input
                                                    value={usersSearch}
                                                    onChange={e => setUsersSearch(e.target.value)}
                                                    placeholder="Search roll no, name, or email..."
                                                    className="ud-search-input"
                                                />
                                                {usersSearch && (
                                                    <button className="ud-search-clear" onClick={() => setUsersSearch('')} aria-label="Clear search">
                                                        <XIcon size={14} strokeWidth={2.5} />
                                                    </button>
                                                )}
                                            </div>

                                            <select
                                                className="ud-filter-select"
                                                value={usersFilters.college}
                                                onChange={e => setUsersFilters(f => ({ ...f, college: e.target.value }))}
                                                aria-label="Filter by college"
                                            >
                                                <option value="">All Colleges</option>
                                                {userFacets.colleges.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>

                                            <select
                                                className="ud-filter-select"
                                                value={usersFilters.branch}
                                                onChange={e => setUsersFilters(f => ({ ...f, branch: e.target.value }))}
                                                aria-label="Filter by department"
                                            >
                                                <option value="">All Departments</option>
                                                {userFacets.branches.map(b => <option key={b} value={b}>{b}</option>)}
                                            </select>

                                            <div className="ud-date-range">
                                                <input
                                                    type="date"
                                                    value={usersFilters.startDate}
                                                    onChange={e => setUsersFilters(f => ({ ...f, startDate: e.target.value }))}
                                                    className="ud-date-input"
                                                    aria-label="Start date"
                                                />
                                                <span className="ud-date-sep">→</span>
                                                <input
                                                    type="date"
                                                    value={usersFilters.endDate}
                                                    onChange={e => setUsersFilters(f => ({ ...f, endDate: e.target.value }))}
                                                    className="ud-date-input"
                                                    aria-label="End date"
                                                />
                                            </div>

                                            <div className="ud-sort-group">
                                                <select
                                                    className="ud-filter-select"
                                                    value={usersFilters.sortBy}
                                                    onChange={e => setUsersFilters(f => ({ ...f, sortBy: e.target.value }))}
                                                    aria-label="Sort by"
                                                >
                                                    <option value="created_at">Date Joined</option>
                                                    <option value="best_score">Best Score</option>
                                                    <option value="total_interviews">Total Interviews</option>
                                                    <option value="first_name">Name</option>
                                                </select>
                                                <button
                                                    className="ud-sort-direction"
                                                    onClick={() => setUsersFilters(f => ({ ...f, sortOrder: f.sortOrder === 'asc' ? 'desc' : 'asc' }))}
                                                    title={`Currently ${usersFilters.sortOrder === 'asc' ? 'ascending' : 'descending'}`}
                                                    aria-label="Toggle sort direction"
                                                >
                                                    <ArrowUpDown size={15} strokeWidth={2} />
                                                    <span>{usersFilters.sortOrder === 'asc' ? 'Asc' : 'Desc'}</span>
                                                </button>
                                            </div>

                                            <button className="ud-reset-btn" onClick={resetUserFilters} title="Reset all filters">
                                                Reset
                                            </button>

                                            <div className="ud-view-toggle" role="group" aria-label="View mode">
                                                <button
                                                    className={`ud-view-btn ${userViewMode === 'list' ? 'active' : ''}`}
                                                    onClick={() => setUserViewMode('list')}
                                                    title="List view"
                                                    aria-label="List view"
                                                ><ListIcon size={15} strokeWidth={2} /></button>
                                                <button
                                                    className={`ud-view-btn ${userViewMode === 'grid' ? 'active' : ''}`}
                                                    onClick={() => setUserViewMode('grid')}
                                                    title="Grid view"
                                                    aria-label="Grid view"
                                                ><LayoutGrid size={15} strokeWidth={2} /></button>
                                            </div>
                                        </div>

                                        {/* User list / grid */}
                                        {usersData.length === 0 ? (
                                            <div className="ud-empty">
                                                <p>No users match your filters.</p>
                                                <button className="ud-reset-btn" onClick={resetUserFilters}>Clear filters</button>
                                            </div>
                                        ) : userViewMode === 'list' ? (
                                            <div className="user-list">
                                                {usersData.map(u => <UserRow key={u._id} user={u}
                                                    onResume={() => handleDownloadResume(u.roll_no)}
                                                    onReset={() => handleResetPassword(u.roll_no)}
                                                    onDelete={() => handleDeleteUser(u.roll_no)}
                                                />)}
                                            </div>
                                        ) : (
                                            <div className="user-cards">
                                                {usersData.map(u => <UserCard key={u._id} user={u}
                                                    onResume={() => handleDownloadResume(u.roll_no)}
                                                    onReset={() => handleResetPassword(u.roll_no)}
                                                    onDelete={() => handleDeleteUser(u.roll_no)}
                                                />)}
                                            </div>
                                        )}

                                        {/* Pagination */}
                                        <Pagination
                                            currentPage={usersPagination.page || 1}
                                            totalPages={usersPagination.totalPages}
                                            totalItems={usersPagination.totalCount || 0}
                                            pageSize={usersPagination.limit || 10}
                                            onPageChange={(p) => fetchUsers(p, usersSearch, usersFilters)}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ========== LIMITS & SETTINGS (merged) ========== */}
                            {activeTab === 'limits' && (
                                <div className="settings-form limits-layout">
                                    <p className="a-muted">Configure question counts per interview mode and the per-user interview cap.</p>

                                    <div className="limits-grid">
                                        {/* LEFT: Question Limits */}
                                        <section className="a-card limits-section">
                                            <header className="limits-section-head">
                                                <span className="limits-section-icon"><HelpCircle size={18} strokeWidth={2} /></span>
                                                <div>
                                                    <h3>Question Limits</h3>
                                                    <p>How many questions are asked in each interview mode.</p>
                                                </div>
                                            </header>
                                            <NumberStepper
                                                label="Resume-Based Interviews"
                                                helper="Questions generated from the candidate's resume skills."
                                                value={settings.questions_resume}
                                                onChange={v => setSettings({ ...settings, questions_resume: v })}
                                                min={1} defaultValue={10}
                                            />
                                            <NumberStepper
                                                label="Custom Selection Interviews"
                                                helper="Questions for technology/module/topic selections."
                                                value={settings.questions_custom}
                                                onChange={v => setSettings({ ...settings, questions_custom: v })}
                                                min={1} defaultValue={10}
                                            />
                                            <NumberStepper
                                                label="HR Behavioral Interviews"
                                                helper="Behavioral questions in an HR round."
                                                value={settings.questions_hr}
                                                onChange={v => setSettings({ ...settings, questions_hr: v })}
                                                min={1} defaultValue={8}
                                            />
                                            <InputField
                                                label="Starting Difficulty"
                                                type="select"
                                                value={settings.starting_difficulty}
                                                options={['Easy', 'Medium', 'Hard']}
                                                onChange={v => setSettings({ ...settings, starting_difficulty: v })}
                                            />
                                        </section>

                                        {/* Time Per Question — auto-advance when timer hits 0 */}
                                        <section className="a-card limits-section">
                                            <header className="limits-section-head">
                                                <span className="limits-section-icon"><Lock size={18} strokeWidth={2} /></span>
                                                <div>
                                                    <h3>Time Per Question (seconds)</h3>
                                                    <p>When the timer hits zero the question auto-skips and the next one loads. Users can still submit early or click Skip.</p>
                                                </div>
                                            </header>
                                            <NumberStepper
                                                label="Resume-Based Interviews"
                                                helper="Time given to answer each question (in seconds)."
                                                value={settings.time_per_question_resume}
                                                onChange={v => setSettings({ ...settings, time_per_question_resume: v })}
                                                min={15} max={600} step={15} defaultValue={60}
                                            />
                                            <NumberStepper
                                                label="Custom Selection Interviews"
                                                helper="Time given to answer each question (in seconds)."
                                                value={settings.time_per_question_custom}
                                                onChange={v => setSettings({ ...settings, time_per_question_custom: v })}
                                                min={15} max={600} step={15} defaultValue={60}
                                            />
                                            <NumberStepper
                                                label="HR Behavioral Interviews"
                                                helper="Time given to answer each question (in seconds)."
                                                value={settings.time_per_question_hr}
                                                onChange={v => setSettings({ ...settings, time_per_question_hr: v })}
                                                min={15} max={600} step={15} defaultValue={60}
                                            />
                                        </section>

                                        {/* RIGHT: Per-User Interview Limit */}
                                        <section className="a-card limits-section">
                                            <header className="limits-section-head">
                                                <span className="limits-section-icon"><Lock size={18} strokeWidth={2} /></span>
                                                <div>
                                                    <h3>Per-User Interview Limit</h3>
                                                    <p>Cap on active (non-archived) interviews per user.</p>
                                                </div>
                                            </header>
                                            <NumberStepper
                                                label="Max Interviews Per User"
                                                helper="Each user can have up to this many active completed interviews. They must archive old ones to free a slot."
                                                value={settings.max_interviews}
                                                onChange={v => setSettings({ ...settings, max_interviews: v })}
                                                min={1} defaultValue={6}
                                            />
                                        </section>

                                        {/* Expo Mode toggle — voice-greeted name capture + leaderboard */}
                                        <section
                                            className={`a-card limits-section expo-section ${settings.expo_mode ? 'expo-on' : ''}`}
                                            style={{ gridColumn: '1 / -1' }}
                                        >
                                            <header className="limits-section-head">
                                                <span className="limits-section-icon"><Lock size={18} strokeWidth={2} /></span>
                                                <div style={{ flex: 1 }}>
                                                    <h3>
                                                        Expo Mode
                                                        {settings.expo_mode && <span className="expo-on-pill">ACTIVE</span>}
                                                    </h3>
                                                    <p>
                                                        When ON: clicking Start Interview routes to a voice-led name
                                                        capture, the AI greets the visitor formally on the first question,
                                                        and the leaderboard at /leaderboard tracks top scorers ranked by
                                                        accuracy + confidence. Real-user behaviour is fully preserved when OFF.
                                                    </p>
                                                </div>
                                                <label className="expo-toggle">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!settings.expo_mode}
                                                        onChange={e => handleExpoToggle(e.target.checked)}
                                                    />
                                                    <span className="expo-toggle-track" aria-hidden="true">
                                                        <span className="expo-toggle-thumb" />
                                                    </span>
                                                </label>
                                            </header>
                                        </section>
                                    </div>

                                    <div className="limits-save-bar">
                                        <button onClick={handleCancelSettings} className="btn-cancel-admin">Cancel</button>
                                        <button onClick={handleSaveSettings} className="btn-save-admin">Save All Settings</button>
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

/** Smoothly animates a number from 0 to `value` using requestAnimationFrame. */
function CountUp({ value = 0, duration = 1100, suffix = '' }) {
    const [display, setDisplay] = React.useState(0);
    const rafRef = React.useRef(null);
    const startRef = React.useRef(null);
    const fromRef = React.useRef(0);

    React.useEffect(() => {
        cancelAnimationFrame(rafRef.current);
        startRef.current = null;
        fromRef.current = display;
        const to = Number.isFinite(value) ? value : 0;

        const tick = (ts) => {
            if (!startRef.current) startRef.current = ts;
            const elapsed = ts - startRef.current;
            const t = Math.min(1, elapsed / duration);
            // easeOutQuart for a natural deceleration
            const eased = 1 - Math.pow(1 - t, 4);
            const current = fromRef.current + (to - fromRef.current) * eased;
            setDisplay(current);
            if (t < 1) rafRef.current = requestAnimationFrame(tick);
            else setDisplay(to);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, duration]);

    // Integer for whole counts, one decimal for percentages, etc.
    const rendered = Number.isInteger(value) ? Math.round(display) : display.toFixed(1);
    return <>{rendered}{suffix}</>;
}

function StatCard({ label, value, color, suffix = '' }) {
    return (
        <div className="a-card stat-card">
            <p className="stat-label">{label}</p>
            <p className="stat-value" style={{ color }}>
                <CountUp value={value} suffix={suffix} />
            </p>
        </div>
    );
}
function TimeCard({ label, count, avg }) {
    return (
        <div className="a-card time-card">
            <p className="time-label">{label}</p>
            <p className="time-count" style={{ color: count > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                <CountUp value={count} />
            </p>
            {avg > 0 && <p className="time-avg">Avg: <CountUp value={avg} suffix="%" /></p>}
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

function NumberStepper({ label, helper, value, onChange, min = 1, max, step = 1, defaultValue }) {
    // When `max` is omitted, the stepper is uncapped (admin can type any number).
    const hasMax = max !== undefined && max !== null;
    const clamp = (n) => {
        const lo = Math.max(min, n);
        return hasMax ? Math.min(max, lo) : lo;
    };
    // Local text state lets the user freely type and backspace without the
    // parent's numeric state fighting the keystrokes. We only push a clamped
    // number to the parent when the input is a valid in-range integer.
    const [text, setText] = React.useState(String(value ?? defaultValue ?? min));

    // Sync from outside when buttons change the value (or prop updates)
    React.useEffect(() => {
        if (value !== undefined && String(value) !== text) {
            setText(String(value));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleTyped = (e) => {
        // Strip anything that's not a digit — only positive integers allowed for these limits
        const cleaned = e.target.value.replace(/[^\d]/g, '');
        setText(cleaned);

        if (cleaned === '') return; // defer validation until blur
        const n = parseInt(cleaned, 10);
        if (Number.isNaN(n)) return;
        // Only push to parent if within bounds; otherwise let blur handle clamp
        if (n >= min && n <= max) onChange(n);
    };

    // Block non-numeric keys at the keydown level so users get instant feedback
    const handleKeyDown = (e) => {
        const allowed = [
            'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'
        ];
        if (allowed.includes(e.key)) return;
        // Allow shortcuts like Ctrl/Cmd + A/C/V/X/Z
        if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) return;
        if (!/^[0-9]$/.test(e.key)) e.preventDefault();
    };

    const handleBlur = () => {
        if (text === '') {
            const fallback = defaultValue ?? min;
            setText(String(fallback));
            onChange(fallback);
            return;
        }
        const n = parseInt(text, 10);
        if (Number.isNaN(n)) {
            const fallback = defaultValue ?? min;
            setText(String(fallback));
            onChange(fallback);
            return;
        }
        const clamped = clamp(n);
        setText(String(clamped));
        onChange(clamped);
    };

    const current = parseInt(text, 10);
    const validCurrent = Number.isFinite(current) ? current : (value ?? defaultValue ?? min);
    const dec = () => { const next = clamp(validCurrent - step); setText(String(next)); onChange(next); };
    const inc = () => { const next = clamp(validCurrent + step); setText(String(next)); onChange(next); };
    const atMin = validCurrent <= min;
    const atMax = hasMax ? validCurrent >= max : false;

    return (
        <div className="number-stepper-field">
            <label className="stepper-label">{label}</label>
            {helper && <p className="stepper-helper">{helper}</p>}
            <div className="stepper-control">
                <button type="button" className="stepper-btn" onClick={dec} disabled={atMin} aria-label="Decrease">
                    <Minus size={16} strokeWidth={2.5} />
                </button>
                <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="stepper-input"
                    value={text}
                    onChange={handleTyped}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                />
                <button type="button" className="stepper-btn" onClick={inc} disabled={atMax} aria-label="Increase">
                    <Plus size={16} strokeWidth={2.5} />
                </button>
            </div>
            {hasMax && <p className="stepper-range">Allowed range: {min}–{max}</p>}
            {!hasMax && <p className="stepper-range">Minimum: {min}</p>}
        </div>
    );
}

function UserCard({ user, onResume, onReset, onDelete }) {
    const avatar = user.profile_picture ? `${SERVER_URL}${user.profile_picture}` : null;
    const best = Math.round(user.best_score || 0);
    const total = user.total_interviews || 0;
    const techs = user.technologies || [];
    const rBest = user.best_resume != null ? Math.round(user.best_resume) : null;
    const cBest = user.best_custom != null ? Math.round(user.best_custom) : null;
    const hBest = user.best_hr != null ? Math.round(user.best_hr) : null;

    // Identify which interview type produced the candidate's best score.
    // We only show ONE label — keeps the card scannable and removes clutter.
    const modes = [
        { id: 'resume', label: 'Resume', Icon: FileText, score: rBest },
        { id: 'custom', label: 'Custom Selection', Icon: Target, score: cBest },
        { id: 'hr', label: 'HR Behavioral', Icon: Users, score: hBest }
    ].filter(m => m.score != null);
    const bestMode = modes.length > 0 ? modes.reduce((a, b) => (b.score > a.score ? b : a)) : null;

    const hasResume = Boolean(user.resume_path);
    const shareUrl = buildShareUrl(user.roll_no);
    const shareText = `Check out ${user.first_name || user.roll_no}'s interview performance on IntelliView`;
    const shareTitle = `${user.first_name || user.roll_no} · IntelliView`;

    return (
        <div className="user-card">
            <div className="uc-head">
                <div className="uc-avatar">
                    {avatar ? <img src={avatar} alt="" /> : <UserRound size={22} strokeWidth={2} />}
                </div>
                <div className="uc-identity">
                    <div className="uc-name">{user.first_name || 'Unnamed'}</div>
                    <div className="uc-roll">{user.roll_no}</div>
                    <div className="uc-email">{user.email || '—'}</div>
                </div>
                <div className="uc-best">
                    <div className="uc-best-label">
                        <Trophy size={12} strokeWidth={2.5} />
                        {bestMode ? `Best · ${bestMode.label}` : 'Best'}
                    </div>
                    <div className="uc-best-score">{best}<small>%</small></div>
                </div>
            </div>

            <div className="uc-meta">
                <span>{user.college || '—'}</span>
                <span className="uc-dot">•</span>
                <span>{user.branch || '—'}</span>
                <span className="uc-dot">•</span>
                <span>Class of {user.passout_year || '—'}</span>
            </div>

            <div className="uc-techs">
                {techs.length === 0 ? (
                    <span className="uc-tech-empty">No interviews yet · {total} total</span>
                ) : (
                    <>
                        <span className="uc-tech-count">{total} interview{total === 1 ? '' : 's'} across:</span>
                        {techs.slice(0, 5).map(t => <span key={t} className="uc-tech-chip">{t}</span>)}
                        {techs.length > 5 && <span className="uc-tech-chip uc-tech-more">+{techs.length - 5} more</span>}
                    </>
                )}
            </div>

            <div className="uc-actions">
                <button
                    className={`uc-btn uc-btn-resume ${!hasResume ? 'disabled' : ''}`}
                    onClick={onResume}
                    disabled={!hasResume}
                    title={hasResume ? 'Download resume' : 'No resume uploaded'}
                >
                    <Download size={14} strokeWidth={2} /> Resume
                </button>
                <div className="uc-share-slot">
                    <ShareMenu url={shareUrl} text={shareText} title={shareTitle}
                        platforms={['linkedin', 'whatsapp', 'copy']} />
                </div>
                <button className="uc-btn uc-btn-reset" onClick={onReset} title="Reset to default password">
                    <KeyRound size={14} strokeWidth={2} /> Reset Password
                </button>
                <button className="uc-btn uc-btn-del" onClick={onDelete} title="Delete user">
                    <Trash2 size={14} strokeWidth={2} /> Delete
                </button>
            </div>
        </div>
    );
}

function UserRow({ user, onResume, onReset, onDelete }) {
    const avatar = user.profile_picture ? `${SERVER_URL}${user.profile_picture}` : null;
    const best = Math.round(user.best_score || 0);
    const total = user.total_interviews || 0;
    const techs = user.technologies || [];
    const skills = user.skills || [];
    const hasResume = Boolean(user.resume_path);

    const scoreTier = best >= 70 ? 'high' : best >= 40 ? 'mid' : best > 0 ? 'low' : 'none';
    const scoreLabel = best >= 70 ? 'Strong' : best >= 40 ? 'Average' : best > 0 ? 'Needs Practice' : 'No data';

    const shareUrl = buildShareUrl(user.roll_no);
    const shareText = `Check out ${user.first_name || user.roll_no}'s interview performance on IntelliView`;
    const shareTitle = `${user.first_name || user.roll_no} · IntelliView`;

    return (
        <div className="user-row">
            {/* Identity column */}
            <div className="ur-identity-col">
                <div className="ur-avatar">
                    {avatar ? <img src={avatar} alt="" /> : <UserRound size={20} strokeWidth={2} />}
                </div>
                <div className="ur-identity">
                    <div className="ur-name">{user.first_name || 'Unnamed'}</div>
                    <div className="ur-roll">{user.roll_no}</div>
                    <div className="ur-college-line">
                        {user.college || '—'} · {user.branch || '—'}
                    </div>
                </div>
            </div>

            {/* Resume column — visual status pill + skill summary */}
            <div className="ur-resume-col">
                <div className={`ur-resume-pill ${hasResume ? 'has' : 'no'}`}>
                    <FileText size={13} strokeWidth={2} />
                    <span>{hasResume ? 'Resume' : 'No resume'}</span>
                    {hasResume && skills.length > 0 && (
                        <span className="ur-skill-count">{skills.length}</span>
                    )}
                </div>
                {hasResume && skills.length > 0 && (
                    <div className="ur-skill-preview" title={skills.join(', ')}>
                        {skills.slice(0, 3).join(' · ')}{skills.length > 3 && ` +${skills.length - 3} more`}
                    </div>
                )}
            </div>

            {/* Performance column — progress bar + interview count */}
            <div className="ur-perf-col">
                <div className="ur-perf-head">
                    <span className={`ur-perf-score ur-tier-${scoreTier}`}>{best}<small>%</small></span>
                    <span className={`ur-perf-tag ur-tier-${scoreTier}`}>{scoreLabel}</span>
                </div>
                <div className="ur-perf-bar">
                    <div className={`ur-perf-fill ur-tier-${scoreTier}`} style={{ width: `${Math.max(2, best)}%` }} />
                </div>
                <div className="ur-perf-meta">
                    <Trophy size={11} strokeWidth={2} /> Best · {total} interview{total === 1 ? '' : 's'}
                </div>
            </div>

            {/* Tech tags column */}
            <div className="ur-techs">
                {techs.length === 0 ? (
                    <span className="ur-no-techs">—</span>
                ) : (
                    <>
                        {techs.slice(0, 3).map(t => <span key={t} className="ur-chip">{t}</span>)}
                        {techs.length > 3 && <span className="ur-chip-more">+{techs.length - 3}</span>}
                    </>
                )}
            </div>

            {/* Action icons */}
            <div className="ur-actions">
                <button
                    className={`ur-action ${!hasResume ? 'disabled' : ''}`}
                    onClick={onResume}
                    disabled={!hasResume}
                    title={hasResume ? 'Download resume' : 'No resume'}
                ><Download size={14} strokeWidth={2} /></button>
                <div className="ur-share">
                    <ShareMenu url={shareUrl} text={shareText} title={shareTitle}
                        platforms={['linkedin', 'whatsapp', 'copy']} />
                </div>
                <button className="ur-action" onClick={onReset} title="Reset password">
                    <KeyRound size={14} strokeWidth={2} />
                </button>
                <button className="ur-action ur-action-del" onClick={onDelete} title="Delete user">
                    <Trash2 size={14} strokeWidth={2} />
                </button>
            </div>
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
