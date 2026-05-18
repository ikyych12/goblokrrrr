import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Shield, 
  Users, 
  ShoppingBag, 
  Activity, 
  Settings as SettingsIcon, 
  ChevronRight,
  UserPlus,
  MessageSquare,
  AlertTriangle,
  LogOut,
  TrendingUp,
  Clock,
  LayoutDashboard,
  Ticket,
  Megaphone,
  Vote,
  Plus
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { cn } from "./lib/utils";

const data = [
  { name: 'Mon', active: 400, sales: 240 },
  { name: 'Tue', active: 300, sales: 139 },
  { name: 'Wed', active: 200, sales: 980 },
  { name: 'Thu', active: 278, sales: 390 },
  { name: 'Fri', active: 189, sales: 480 },
  { name: 'Sat', active: 239, sales: 380 },
  { name: 'Sun', active: 349, sales: 430 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState({ totalUsers: 0, totalTransactions: 0 });
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupSettings, setGroupSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [botStatus, setBotStatus] = useState({ initialized: false, polling: false });
  const [usersList, setUsersList] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [blacklist, setBlacklist] = useState<any[]>([]);
  const [broadcastTarget, setBroadcastTarget] = useState("users");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [polls, setPolls] = useState<any[]>([]);
  const [newPollQuestion, setNewPollQuestion] = useState("");
  const [newPollOptions, setNewPollOptions] = useState<string[]>(["Yes", "No"]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, groupsRes, statusRes, usersRes, logsRes, blacklistRes, pollsRes] = await Promise.allSettled([
          fetch("/api/stats").then(res => res.json()),
          fetch("/api/groups").then(res => res.json()),
          fetch("/api/bot-status").then(res => res.json()),
          fetch("/api/users").then(res => res.json()),
          fetch("/api/logs").then(res => res.json()),
          fetch("/api/blacklist").then(res => res.json()),
          fetch("/api/polls").then(res => res.json())
        ]);

        if (statsRes.status === "fulfilled") setStats(statsRes.value);
        if (groupsRes.status === "fulfilled") setGroups(groupsRes.value);
        if (statusRes.status === "fulfilled") setBotStatus(statusRes.value);
        if (usersRes.status === "fulfilled") setUsersList(usersRes.value);
        if (logsRes.status === "fulfilled") setLogs(logsRes.value);
        if (blacklistRes.status === "fulfilled") setBlacklist(blacklistRes.value);
        if (pollsRes.status === "fulfilled") setPolls(pollsRes.value);
      } catch (err) {
        console.error("Critical fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const [newKeyword, setNewKeyword] = useState("");
  const [newAutoTrigger, setNewAutoTrigger] = useState("");
  const [newAutoReply, setNewAutoReply] = useState("");

  const [newBlacklistId, setNewBlacklistId] = useState("");
  const [newBlacklistReason, setNewBlacklistReason] = useState("");

  const addToBlacklist = () => {
    if (!newBlacklistId) return;
    fetch("/api/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId: newBlacklistId, reason: newBlacklistReason, bannedBy: "Admin" })
    }).then(() => {
      setBlacklist(prev => [...prev, { telegramId: newBlacklistId, reason: newBlacklistReason, createdAt: new Date().toISOString() }]);
      setNewBlacklistId("");
      setNewBlacklistReason("");
    });
  };

  const removeFromBlacklist = (id: string) => {
    fetch(`/api/blacklist/${id}`, { method: "DELETE" })
      .then(() => setBlacklist(prev => prev.filter(b => b.id !== id)));
  };

  const createPoll = () => {
    if (!newPollQuestion || newPollOptions.filter(o => o.trim()).length < 2) {
      alert("Question and at least 2 options required");
      return;
    }
    fetch("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: newPollQuestion, options: newPollOptions.filter(o => o.trim()) })
    }).then(res => res.json()).then(data => {
      setPolls(prev => [{ question: newPollQuestion, options: newPollOptions.filter(o => o.trim()), createdAt: new Date().toISOString() }, ...prev]);
      setNewPollQuestion("");
      setNewPollOptions(["Yes", "No"]);
      alert(`Poll sent to ${data.sent} groups`);
    });
  };

  const addAutoReply = () => {
    if (!selectedGroup || !groupSettings || !newAutoTrigger || !newAutoReply) return;
    const replies = groupSettings.autoReplies || [];
    const newSettings = { ...groupSettings, autoReplies: [...replies, { trigger: newAutoTrigger, reply: newAutoReply }] };
    setGroupSettings(newSettings);
    saveSettings(newSettings);
    setNewAutoTrigger("");
    setNewAutoReply("");
  };

  const removeAutoReply = (trigger: string) => {
    if (!selectedGroup || !groupSettings) return;
    const replies = groupSettings.autoReplies || [];
    const newSettings = { ...groupSettings, autoReplies: replies.filter((r: any) => r.trigger !== trigger) };
    setGroupSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleBroadcast = () => {
    if (!broadcastMessage.trim()) return;
    setIsBroadcasting(true);
    fetch("/api/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: broadcastTarget, message: broadcastMessage })
    }).then(() => {
      setIsBroadcasting(false);
      setBroadcastMessage("");
      alert("Broadcast finished!");
    });
  };

  const updateUserRole = (userId: string, role: string) => {
    fetch(`/api/users/${userId}/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role })
    }).then(() => {
       setUsersList(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    });
  };

  useEffect(() => {
    if (selectedGroup) {
      fetch(`/api/groups/${selectedGroup}/settings`)
        .then(res => res.json())
        .then(data => setGroupSettings(data));
    }
  }, [selectedGroup]);

  const toggleSetting = (key: string) => {
    if (!selectedGroup || !groupSettings) return;
    const newSettings = { ...groupSettings, [key]: !groupSettings[key] };
    setGroupSettings(newSettings);
    saveSettings(newSettings);
  };

  const addKeyword = () => {
    if (!selectedGroup || !groupSettings || !newKeyword.trim()) return;
    const keywords = groupSettings.forbiddenKeywords || [];
    if (keywords.includes(newKeyword.trim())) return;
    const newSettings = { ...groupSettings, forbiddenKeywords: [...keywords, newKeyword.trim()] };
    setGroupSettings(newSettings);
    saveSettings(newSettings);
    setNewKeyword("");
  };

  const removeKeyword = (word: string) => {
    if (!selectedGroup || !groupSettings) return;
    const keywords = groupSettings.forbiddenKeywords || [];
    const newSettings = { ...groupSettings, forbiddenKeywords: keywords.filter((w: string) => w !== word) };
    setGroupSettings(newSettings);
    saveSettings(newSettings);
  };

  const saveSettings = (settings: any) => {
    fetch(`/api/groups/${selectedGroup}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-white">
      <AnimatePresence>
        {loading && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#E4E3E0] flex flex-col items-center justify-center space-y-4"
          >
            <div className="w-12 h-12 bg-[#141414] rounded-sm flex items-center justify-center animate-spin">
              <Shield className="text-[#E4E3E0] size-6" />
            </div>
            <p className="text-[10px] font-mono uppercase tracking-[0.4em] opacity-40">Initializing Elite Guard...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 border-right border-[#141414]/10 bg-[#E4E3E0] z-50">
        <div className="p-8 border-bottom border-[#141414]/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#141414] rounded-sm flex items-center justify-center">
              <Shield className="text-[#E4E3E0] size-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight uppercase tracking-tighter">GuardBot</h1>
              <span className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Control Panel v1.0</span>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-2">
          <NavItem active={activeTab === "overview"} onClick={() => setActiveTab("overview")} icon={<LayoutDashboard size={20} />} label="Overview" />
          <NavItem active={activeTab === "users"} onClick={() => setActiveTab("users")} icon={<Users size={20} />} label="Identity" />
          <NavItem active={activeTab === "transactions"} onClick={() => setActiveTab("transactions")} icon={<Ticket size={20} />} label="Financial" />
          <NavItem active={activeTab === "logs"} onClick={() => setActiveTab("logs")} icon={<Activity size={20} />} label="Activity" />
          <NavItem active={activeTab === "blacklist"} onClick={() => setActiveTab("blacklist")} icon={<Shield size={20} />} label="Blacklist" />
          <NavItem active={activeTab === "polls"} onClick={() => setActiveTab("polls")} icon={<Vote size={20} />} label="Polls" />
          <NavItem active={activeTab === "broadcast"} onClick={() => setActiveTab("broadcast")} icon={<Megaphone size={20} />} label="Broadcast" />
          <NavItem active={activeTab === "settings"} onClick={() => setActiveTab("settings")} icon={<SettingsIcon size={20} />} label="Bot Settings" />
        </nav>

        <div className="absolute bottom-0 left-0 w-full p-6 border-top border-[#141414]/10 space-y-4">
          <div className="bg-[#141414]/5 rounded-sm p-4 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest opacity-40">
              <span>Telegram Bot</span>
              <span className={cn(
                "w-2 h-2 rounded-full",
                botStatus.initialized ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              )}></span>
            </div>
            <div className="text-[10px] font-mono font-bold tracking-tight">
              {botStatus.initialized ? "ONLINE & POLLING" : "MISSING TOKEN"}
            </div>
          </div>
          <button className="flex items-center gap-3 text-xs uppercase font-mono tracking-widest hover:opacity-100 opacity-60 transition-opacity">
            <LogOut size={14} /> Log out session
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="pl-64 min-h-screen">
        <header className="h-20 border-bottom border-[#141414]/10 flex items-center justify-between px-10 sticky top-0 bg-[#E4E3E0]/80 backdrop-blur-sm z-40">
          <div className="flex items-center gap-4 text-xs font-mono tracking-widest opacity-40 uppercase">
            <span>Server: ASIA-SE1</span>
            <span className="w-1 h-1 bg-[#141414] rounded-full mx-2" />
            <span>DB Status: Connected</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex -space-x-2">
              {[1,2,3].map(i => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-[#E4E3E0] bg-gray-300" />
              ))}
            </div>
            <button className="text-[10px] px-3 py-1 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors uppercase font-mono tracking-widest">
              Join Support Group
            </button>
          </div>
        </header>

        <div className="p-10 max-w-7xl mx-auto">
          {activeTab === "overview" && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="space-y-10"
            >
              <div className="grid grid-cols-4 gap-4">
                <StatCard label="Total Members" value={stats.totalUsers} change="+12%" />
                <StatCard label="Total Revenue" value={`Rp ${(stats.totalTransactions * 25000).toLocaleString()}`} change="+Rp 25k" />
                <StatCard label="Pending Rental" value="3" change="Review" />
                <StatCard label="Links Blocked" value="1,204" change="+54" />
              </div>

              <div className="grid grid-cols-3 gap-8">
                <div className="col-span-2 space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="font-serif italic text-2xl tracking-tighter">Revenue Analysis</h2>
                    <span className="text-[10px] font-mono opacity-50 uppercase">Live Rental Stats</span>
                  </div>
                  <div className="h-[300px] w-full bg-[#141414]/5 border border-[#141414]/10 p-6 rounded-sm">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data}>
                        <defs>
                          <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#141414" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#141414" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#14141422" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#14141466', fontFamily: 'monospace' }}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#14141466', fontFamily: 'monospace' }}
                        />
                        <Tooltip />
                        <Area type="monotone" dataKey="active" stroke="#141414" fillOpacity={1} fill="url(#colorSales)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-6">
                  <h2 className="font-serif italic text-2xl tracking-tighter">Control Log</h2>
                  <div className="space-y-3">
                    <AlertItem type="high" label="User @shawn Kicked (Expired)" time="2m ago" />
                    <AlertItem type="med" label="Rental Paid: Package 2" time="15m ago" />
                    <AlertItem type="low" label="Join Req: @alex (Approved)" time="1h ago" />
                    <AlertItem type="low" label="Join Req: @bot1 (Declined)" time="3h ago" />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h2 className="font-serif italic text-2xl tracking-tighter">Elite Member Status</h2>
                <div className="border border-[#141414]/10 bg-white shadow-sm overflow-hidden rounded-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#141414]/5 border-bottom border-[#141414]/10">
                        <th className="px-6 py-4 text-[10px] font-mono tracking-widest uppercase opacity-50">Username</th>
                        <th className="px-6 py-4 text-[10px] font-mono tracking-widest uppercase opacity-50">Role</th>
                        <th className="px-6 py-4 text-[10px] font-mono tracking-widest uppercase opacity-50">Expiry</th>
                        <th className="px-6 py-4 text-[10px] font-mono tracking-widest uppercase opacity-50">Last Active</th>
                        <th className="px-6 py-4 text-[10px] font-mono tracking-widest uppercase opacity-50">Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-mono tracking-tighter">
                      <TableRow user="@kytyg_adm" role="Owner" sales="Permanent" rev="Online" status="Manage" />
                      <TableRow user="@rex_sellz" role="Seller" sales="2024-06-18" rev="2m ago" status="Kick" />
                      <TableRow user="@vip_user" role="VIP" sales="2024-05-20" rev="1h ago" status="Extend" />
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "users" && (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ duration: 0.15 }}
               className="space-y-6"
             >
               <div className="flex items-center justify-between">
                  <h2 className="font-serif italic text-3xl tracking-tighter">Identity Management</h2>
                  <div className="flex gap-4">
                     <input 
                       type="text" 
                       placeholder="Search ID or Username..."
                       className="bg-white border border-[#141414]/10 rounded-sm px-4 py-2 text-xs font-mono focus:outline-none focus:border-[#141414]/40 w-64"
                       onChange={(e) => {
                         fetch(`/api/users?search=${e.target.value}`)
                           .then(res => res.json())
                           .then(data => setUsersList(data));
                       }}
                     />
                  </div>
               </div>

               <div className="border border-[#141414]/10 bg-white shadow-sm overflow-hidden rounded-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#141414]/5 border-bottom border-[#141414]/10">
                        <th className="px-6 py-4 text-[10px] font-mono tracking-widest uppercase opacity-50">Telegram User</th>
                        <th className="px-6 py-4 text-[10px] font-mono tracking-widest uppercase opacity-50">Role</th>
                        <th className="px-6 py-4 text-[10px] font-mono tracking-widest uppercase opacity-50">Expiry</th>
                        <th className="px-6 py-4 text-[10px] font-mono tracking-widest uppercase opacity-50">Balance</th>
                        <th className="px-6 py-4 text-[10px] font-mono tracking-widest uppercase opacity-50 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-mono tracking-tighter">
                      {usersList.map((user: any) => (
                        <tr key={user.id} className="border-bottom border-[#141414]/5 hover:bg-[#141414]/5 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold">@{user.username || "n/a"}</div>
                            <div className="text-[10px] opacity-40">{user.telegramId}</div>
                          </td>
                          <td className="px-6 py-4 uppercase text-xs">
                             <span className={cn(
                               "px-2 py-0.5 rounded-full text-[10px]",
                               user.role === 'admin' || user.role === 'owner' ? "bg-red-100 text-red-700" :
                               user.role === 'vip' ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"
                             )}>
                               {user.role}
                             </span>
                          </td>
                          <td className="px-6 py-4 text-xs">
                            {user.expiryDate ? new Date(user.expiryDate).toLocaleDateString() : "Permanent"}
                          </td>
                          <td className="px-6 py-4">Rp {user.balance?.toLocaleString() || 0}</td>
                          <td className="px-6 py-4 text-right">
                            <select 
                              className="text-[10px] bg-[#141414]/5 border border-[#141414]/10 px-2 py-1 rounded-sm focus:outline-none"
                              value={user.role}
                              onChange={(e) => updateUserRole(user.id, e.target.value)}
                            >
                              <option value="member">MEMBER</option>
                              <option value="vip">VIP</option>
                              <option value="guard">GUARD</option>
                              <option value="seller">SELLER</option>
                              <option value="admin">ADMIN</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                      {usersList.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center opacity-40 italic">No users found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
               </div>
             </motion.div>
          )}

          {activeTab === "logs" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="space-y-6">
              <h2 className="font-serif italic text-3xl tracking-tighter">System Activity Logs</h2>
              <div className="border border-[#141414]/10 bg-white rounded-sm overflow-hidden">
                {logs.map((log: any) => (
                  <div key={log.id} className="p-4 border-b border-[#141414]/5 flex items-center justify-between hover:bg-[#141414]/5 transition-colors font-mono text-[10px]">
                    <div className="flex items-center gap-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded-sm uppercase",
                        log.type === 'security' ? "bg-red-100 text-red-700" :
                        log.type === 'broadcast' ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"
                      )}>{log.type}</span>
                      <span className="font-bold uppercase tracking-widest">{log.action}</span>
                      <span className="opacity-50">{log.details}</span>
                    </div>
                    <span className="opacity-30">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === "blacklist" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="font-serif italic text-3xl tracking-tighter">Global Blacklist</h2>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Telegram ID..."
                    value={newBlacklistId}
                    onChange={(e) => setNewBlacklistId(e.target.value)}
                    className="bg-white border border-[#141414]/10 rounded-sm px-4 py-2 text-xs font-mono focus:outline-none"
                  />
                  <input 
                    type="text" 
                    placeholder="Reason..."
                    value={newBlacklistReason}
                    onChange={(e) => setNewBlacklistReason(e.target.value)}
                    className="bg-white border border-[#141414]/10 rounded-sm px-4 py-2 text-xs font-mono focus:outline-none"
                  />
                  <button 
                    onClick={addToBlacklist}
                    className="bg-[#141414] text-white px-4 py-2 rounded-sm text-[10px] uppercase font-mono tracking-widest"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {blacklist.map((item: any) => (
                  <div key={item.id} className="p-6 bg-white border border-[#141414]/10 rounded-sm flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-mono text-sm font-bold">{item.telegramId}</p>
                      <p className="text-[10px] font-mono opacity-40 uppercase">Reason: {item.reason || "No reason provided"}</p>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="text-[8px] font-mono opacity-30 uppercase">{new Date(item.createdAt).toLocaleString()}</span>
                      <button 
                        onClick={() => removeFromBlacklist(item.id)}
                        className="text-red-500 hover:text-red-700 transition-colors uppercase text-[10px] font-mono font-bold"
                      >
                        Unban
                      </button>
                    </div>
                  </div>
                ))}
                {blacklist.length === 0 && (
                  <div className="h-64 border border-dashed border-[#141414]/20 flex items-center justify-center rounded-sm">
                    <p className="text-[10px] font-mono opacity-30 uppercase tracking-[0.2em]">Blacklist is empty</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "polls" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="space-y-10">
              <div className="flex items-center justify-between">
                <h2 className="font-serif italic text-3xl tracking-tighter">System Polling</h2>
                <button 
                   onClick={() => setNewPollQuestion("New Poll Question?")}
                   className="flex items-center gap-2 bg-[#141414] text-white px-6 py-2 rounded-sm text-[10px] uppercase font-mono tracking-widest"
                >
                  <Plus size={14} /> Create New Poll
                </button>
              </div>

              <div className="grid grid-cols-2 gap-10">
                <div className="space-y-6">
                  {newPollQuestion !== "" && (
                    <div className="bg-white border border-[#141414]/10 p-8 rounded-sm space-y-6 shadow-sm">
                      <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-40">Poll Creator</h3>
                      <div className="space-y-4">
                        <input 
                          type="text" 
                          value={newPollQuestion}
                          onChange={(e) => setNewPollQuestion(e.target.value)}
                          placeholder="Poll Question"
                          className="w-full bg-[#141414]/5 border border-[#141414]/10 rounded-sm px-4 py-3 text-sm font-mono focus:outline-none"
                        />
                        <div className="space-y-2">
                          {newPollOptions.map((opt, idx) => (
                            <div key={idx} className="flex gap-2">
                              <input 
                                type="text" 
                                value={opt}
                                onChange={(e) => {
                                  const opts = [...newPollOptions];
                                  opts[idx] = e.target.value;
                                  setNewPollOptions(opts);
                                }}
                                placeholder={`Option ${idx + 1}`}
                                className="flex-1 bg-[#141414]/5 border border-[#141414]/10 rounded-sm px-4 py-2 text-xs font-mono focus:outline-none"
                              />
                              {newPollOptions.length > 2 && (
                                <button 
                                  onClick={() => setNewPollOptions(newPollOptions.filter((_, i) => i !== idx))}
                                  className="text-red-500 font-bold px-2"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                          <button 
                            onClick={() => setNewPollOptions([...newPollOptions, ""])}
                            className="text-[10px] font-mono opacity-40 uppercase tracking-widest hover:opacity-100 mt-2"
                          >
                            + Add Option
                          </button>
                        </div>
                        <button 
                          onClick={createPoll}
                          className="w-full bg-[#141414] text-white py-4 rounded-sm font-mono text-xs uppercase tracking-[0.3em] mt-4"
                        >
                          Send Poll to All Groups
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-40">Active & Recent Polls</h3>
                    {polls.length === 0 && <p className="opacity-30 italic text-xs font-mono uppercase">No polls created yet.</p>}
                    {polls.map((poll: any, idx: number) => (
                      <div key={idx} className="p-6 bg-white border border-[#141414]/10 rounded-sm">
                        <div className="flex justify-between items-start mb-4">
                          <p className="font-bold tracking-tight text-lg">{poll.question}</p>
                          <span className="text-[8px] font-mono opacity-30 uppercase">{new Date(poll.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="space-y-2">
                          {poll.options.map((opt: string, i: number) => (
                            <div key={i} className="h-8 bg-[#141414]/5 border border-[#141414]/5 rounded-sm flex items-center px-4 justify-between font-mono text-[10px]">
                              <span className="opacity-60">{opt}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#141414]/5 border border-[#141414]/10 p-10 rounded-sm flex flex-col items-center justify-center text-center space-y-6">
                   <div className="w-16 h-16 bg-[#141414] rounded-full flex items-center justify-center">
                     <Vote className="text-white size-8" />
                   </div>
                   <div className="max-w-xs space-y-2">
                      <h4 className="font-serif italic text-2xl tracking-tighter">Community Engagement</h4>
                      <p className="text-xs font-mono opacity-40 leading-relaxed uppercase tracking-widest">
                        Use polls to gather feedback from your group members. Voting is anonymous by default.
                      </p>
                   </div>
                   <div className="pt-10 grid grid-cols-2 gap-8 w-full">
                      <div className="text-center">
                        <p className="text-3xl font-bold tracking-tighter">1,240</p>
                        <p className="text-[8px] font-mono opacity-40 uppercase tracking-[0.2em]">Total Votes</p>
                      </div>
                      <div className="text-center">
                        <p className="text-3xl font-bold tracking-tighter">{polls.length}</p>
                        <p className="text-[8px] font-mono opacity-40 uppercase tracking-[0.2em]">Polls Sent</p>
                      </div>
                   </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "broadcast" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="max-w-2xl mx-auto space-y-10">
              <div className="text-center">
                <h2 className="font-serif italic text-4xl tracking-tighter">Broadcast Center</h2>
                <p className="text-[10px] font-mono opacity-40 uppercase tracking-[0.3em] mt-2">Announce to all users or groups</p>
              </div>

              <div className="bg-white border border-[#141414]/10 p-8 rounded-sm space-y-8 shadow-sm">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-widest opacity-40">Target Audience</label>
                  <div className="flex gap-2">
                    {["users", "groups"].map(t => (
                      <button 
                        key={t}
                        onClick={() => setBroadcastTarget(t)}
                        className={cn(
                          "flex-1 py-3 border rounded-sm font-mono text-[10px] uppercase tracking-widest transition-all",
                          broadcastTarget === t ? "bg-[#141414] text-white border-[#141414]" : "border-[#141414]/10 hover:border-[#141414]/40"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-widest opacity-40">Message Content (Markdown)</label>
                  <textarea 
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    placeholder="Type your announcement here..."
                    className="w-full h-48 bg-[#141414]/5 border border-[#141414]/10 rounded-sm px-6 py-4 text-sm font-mono focus:outline-none focus:border-[#141414]/40 resize-none"
                  />
                </div>

                <button 
                  onClick={handleBroadcast}
                  disabled={isBroadcasting}
                  className="w-full bg-[#141414] text-white py-4 rounded-sm font-mono text-xs uppercase tracking-[0.3em] hover:bg-black transition-all flex items-center justify-center gap-3"
                >
                  {isBroadcasting ? "Sending..." : <><Megaphone size={16} /> Send Broadcast</>}
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === "settings" && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="space-y-10"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif italic text-3xl tracking-tighter">Bot Configuration</h2>
                  <p className="text-xs font-mono opacity-40 uppercase tracking-widest mt-1">Manage Auto-Moderation Rules per Group</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-10">
                <div className="space-y-6">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-40">Select Group</h3>
                  <div className="space-y-2">
                    {groups.map(group => (
                      <button 
                        key={group.id}
                        onClick={() => setSelectedGroup(group.id)}
                        className={cn(
                          "w-full text-left p-4 border border-[#141414]/10 rounded-sm transition-all flex items-center justify-between group",
                          selectedGroup === group.id ? "bg-[#141414] text-[#E4E3E0]" : "bg-white hover:border-[#141414]/40"
                        )}
                      >
                        <span className="font-mono text-sm tracking-tighter">{group.title}</span>
                        <ChevronRight size={14} className={cn(selectedGroup === group.id ? "opacity-100" : "opacity-0 group-hover:opacity-40")} />
                      </button>
                    ))}
                    {groups.length === 0 && <p className="text-xs font-mono opacity-40 italic">No groups tracked yet. Add bot to a group first.</p>}
                  </div>
                </div>

                  <div className="col-span-2 space-y-8">
                    {activeTab === "settings" && !selectedGroup && (
                       <div className="p-10 bg-white border border-[#141414]/10 rounded-sm space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-[#141414] rounded-sm flex items-center justify-center">
                            <SettingsIcon className="text-white size-6" />
                          </div>
                          <div>
                            <h3 className="font-serif italic text-2xl tracking-tighter">Bot Diagnostic</h3>
                            <p className="text-[10px] font-mono opacity-40 uppercase tracking-widest">Check System Integrity</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-6 bg-[#141414]/5 space-y-2 rounded-sm">
                            <p className="text-[10px] font-mono uppercase opacity-40">Connection Status</p>
                            <p className="text-sm font-bold font-mono">
                              {botStatus.initialized ? "✅ INITIALIZED" : "❌ TOKEN MISSING"}
                            </p>
                          </div>
                          <div className="p-6 bg-[#141414]/5 space-y-2 rounded-sm">
                            <p className="text-[10px] font-mono uppercase opacity-40">Polling Status</p>
                            <p className="text-sm font-bold font-mono">
                              {botStatus.polling ? "✅ ACTIVE" : "❌ INACTIVE"}
                            </p>
                          </div>
                        </div>

                        <button 
                          onClick={() => {
                            fetch("/api/bot-check")
                              .then(res => res.json())
                              .then(data => {
                                if (data.ok) {
                                  alert(`Connected to Bot: @${data.me.username}`);
                                } else {
                                  alert(`Bot Error: ${data.error}`);
                                }
                              })
                              .catch(err => alert("Server unreachable"));
                          }}
                          className="w-full py-4 border border-[#141414] text-[10px] font-mono uppercase tracking-[0.3em] hover:bg-[#141414] hover:text-white transition-all"
                        >
                          Perform Deep Connectivity Test
                        </button>
                      </div>
                    )}
                    {selectedGroup ? (
                    <>
                      <div className="p-8 bg-white border border-[#141414]/10 rounded-sm space-y-10">
                        <div className="space-y-4">
                          <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-40">Auto-Moderation Rules</h3>
                          
                          <ToggleRow 
                            label="Anti-Link Protection" 
                            description="Automatically delete messages containing URLs (HTTP/T.ME)"
                            active={groupSettings?.protectLinks}
                            onToggle={() => toggleSetting("protectLinks")}
                          />
                          
                          <ToggleRow 
                            label="Anti-Toxic Keywords" 
                            description="Block and delete profanity, insults, and toxic language"
                            active={groupSettings?.protectToxic}
                            onToggle={() => toggleSetting("protectToxic")}
                          />

                          <ToggleRow 
                            label="Anti-Spam Shield" 
                            description="Rate limit messages and block repeated content"
                            active={groupSettings?.protectSpam}
                            onToggle={() => toggleSetting("protectSpam")}
                          />
                        </div>

                        <div className="pt-8 border-t border-[#141414]/5 space-y-4">
                          <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-40">Welcome Message</h3>
                          <textarea 
                            value={groupSettings?.welcomeMessage || ""}
                            onChange={(e) => {
                              const newSettings = { ...groupSettings, welcomeMessage: e.target.value };
                              setGroupSettings(newSettings);
                              saveSettings(newSettings);
                            }}
                            placeholder="Selamat datang {name}..."
                            className="w-full bg-[#141414]/5 border border-[#141414]/10 rounded-sm px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#141414]/40 h-24 resize-none"
                          />
                          <p className="text-[8px] font-mono opacity-30 uppercase">Use &#123;name&#125; for user mention</p>
                        </div>

                        <div className="pt-8 border-t border-[#141414]/5">
                          <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-40 mb-4">Custom Keywords</h3>
                          <div className="flex gap-2 mb-4">
                            <input 
                              type="text" 
                              value={newKeyword}
                              onChange={(e) => setNewKeyword(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                              placeholder="Add forbidden word..."
                              className="flex-1 bg-[#141414]/5 border border-[#141414]/10 rounded-sm px-4 py-2 text-sm font-mono focus:outline-none focus:border-[#141414]/40"
                            />
                            <button 
                              onClick={addKeyword}
                              className="bg-[#141414] text-[#E4E3E0] px-4 py-2 rounded-sm text-xs font-mono uppercase tracking-widest"
                            >
                              Add
                            </button>
                          </div>
                          
                          <div className="flex flex-wrap gap-2">
                            {groupSettings?.forbiddenKeywords?.map((word: string) => (
                              <div key={word} className="flex items-center gap-2 px-3 py-1 bg-[#141414]/5 border border-[#141414]/10 rounded-sm text-[10px] font-mono uppercase tracking-tighter">
                                {word}
                                <button onClick={() => removeKeyword(word)} className="hover:text-red-500 transition-colors">×</button>
                              </div>
                            ))}
                            {(!groupSettings?.forbiddenKeywords || groupSettings.forbiddenKeywords.length === 0) && (
                              <p className="text-[10px] font-mono opacity-20 uppercase tracking-widest italic">No custom keywords added</p>
                            )}
                          </div>
                        </div>

                        <div className="pt-8 border-t border-[#141414]/5 space-y-4">
                          <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-40">Auto-Reply Triggers</h3>
                          <div className="grid grid-cols-2 gap-2">
                             <input 
                              type="text" 
                              value={newAutoTrigger}
                              onChange={(e) => setNewAutoTrigger(e.target.value)}
                              placeholder="If user says..."
                              className="bg-[#141414]/5 border border-[#141414]/10 rounded-sm px-4 py-2 text-sm font-mono focus:outline-none"
                            />
                            <input 
                              type="text" 
                              value={newAutoReply}
                              onChange={(e) => setNewAutoReply(e.target.value)}
                              placeholder="Bot replies..."
                              className="bg-[#141414]/5 border border-[#141414]/10 rounded-sm px-4 py-2 text-sm font-mono focus:outline-none"
                            />
                          </div>
                          <button 
                            onClick={addAutoReply}
                            className="w-full bg-[#141414] text-white py-2 rounded-sm text-[10px] uppercase font-mono tracking-widest"
                          >
                            Add Auto-Reply
                          </button>

                          <div className="space-y-2 mt-4">
                            {groupSettings?.autoReplies?.map((ar: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between p-3 bg-[#141414]/5 border border-[#141414]/10 rounded-sm font-mono text-[10px]">
                                <div className="flex gap-4">
                                  <span className="font-bold">"{ar.trigger}"</span>
                                  <span className="opacity-40">→</span>
                                  <span>{ar.reply}</span>
                                </div>
                                <button onClick={() => removeAutoReply(ar.trigger)} className="text-red-500 hover:text-red-700">Delete</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-64 border border-dashed border-[#141414]/20 flex items-center justify-center rounded-sm">
                      <p className="text-xs font-mono opacity-30 uppercase tracking-[0.2em]">Please select a group to view settings</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}

function ToggleRow({ label, description, active, onToggle }: any) {
  return (
    <div className="flex items-center justify-between p-4 border border-[#141414]/5 hover:bg-[#141414]/5 transition-colors rounded-sm">
      <div className="space-y-1">
        <p className="text-sm font-bold tracking-tight">{label}</p>
        <p className="text-[10px] font-mono opacity-40 uppercase tracking-tighter">{description}</p>
      </div>
      <button 
        onClick={onToggle}
        className={cn(
          "w-12 h-6 rounded-full transition-all relative",
          active ? "bg-[#141414]" : "bg-[#141414]/10"
        )}
      >
        <motion.div 
          animate={{ x: active ? 26 : 2 }}
          className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm" 
        />
      </button>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-xs uppercase font-mono tracking-widest transition-all rounded-sm",
        active ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/5 text-[#141414]/60 hover:text-[#141414]"
      )}
    >
      {icon}
      <span>{label}</span>
      {active && <motion.div layoutId="pill" className="ml-auto w-1.5 h-1.5 bg-[#E4E3E0] rounded-full" />}
    </button>
  );
}

function StatCard({ label, value, change }: any) {
  return (
    <div className="p-6 bg-white border border-[#141414]/10 shadow-sm rounded-sm group hover:border-[#141414]/40 transition-colors">
      <div className="text-[10px] uppercase font-mono tracking-widest opacity-40 mb-4 flex items-center justify-between">
        {label}
        {change.includes('+') ? <TrendingUp size={12} className="text-emerald-600" /> : <Clock size={12} />}
      </div>
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold tracking-tighter tabular-nums">{value}</span>
        <span className={cn(
          "text-[10px] font-mono",
          change.includes('+') ? "text-emerald-600" : "opacity-40"
        )}>{change}</span>
      </div>
    </div>
  );
}

function AlertItem({ type, label, time }: any) {
  const colors = {
    high: "bg-red-500",
    med: "bg-yellow-500",
    low: "bg-blue-500"
  };
  return (
    <div className="flex items-center gap-4 p-4 border border-[#141414]/10 bg-white/40 hover:bg-white transition-colors rounded-sm group">
      <div className={cn("w-1.5 h-1.5 rounded-full", colors[type as keyof typeof colors])} />
      <div className="flex-1">
        <p className="text-xs font-mono uppercase tracking-widest leading-none mb-1">{label}</p>
        <span className="text-[9px] font-mono opacity-40 uppercase tracking-tighter">{time}</span>
      </div>
      <ChevronRight size={14} className="opacity-0 group-hover:opacity-40 transition-opacity" />
    </div>
  );
}

function TableRow({ user, role, sales, rev, status }: any) {
  return (
    <tr className="border-bottom border-[#141414]/5 hover:bg-[#141414]/5 transition-colors group cursor-pointer">
      <td className="px-6 py-4 flex items-center gap-3">
        <div className="w-6 h-6 rounded-full bg-[#141414]/10 group-hover:bg-[#141414]/20 transition-colors" />
        {user}
      </td>
      <td className="px-6 py-4 opacity-50">{role}</td>
      <td className="px-6 py-4">{sales}</td>
      <td className="px-6 py-4">{rev}</td>
      <td className="px-6 py-4 underline underline-offset-4 decoration-[#141414]/20">{status}</td>
    </tr>
  );
}
