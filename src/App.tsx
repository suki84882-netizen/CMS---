import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  MessageSquare, 
  Search, 
  Download, 
  RotateCcw, 
  ChevronRight,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Database,
  LogOut,
  ChevronDown,
  Calendar as CalendarIcon,
  Filter
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  addDoc, 
  onSnapshot
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { db, auth } from './firebase';
import { cn, formatDate } from './lib/utils';
import { exportToExcel } from './lib/excel';

// Types
interface UserRecord {
  id: string;
  userId: string;
  registrationTime: string;
  appType: string;
  conversationRounds: number;
  latestConversationTime: string;
}

interface MessageRecord {
  userId: string;
  role: 'AI' | 'User';
  content: string;
  scene: string;
  language: string;
  timestamp: string;
  appType: string;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('conversations');
  
  // Filters
  const [filterUserId, setFilterUserId] = useState('');
  const [filterAppType, setFilterAppType] = useState('全部');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const [records, setRecords] = useState<UserRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'users'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserRecord[];
      setRecords(data);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = () => signOut(auth);

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // Handle multiple IDs separated by commas
      const searchIds = filterUserId.split(/[，,]/).map(id => id.trim()).filter(id => id);
      const matchId = searchIds.length > 0 
        ? searchIds.some(id => r.userId.includes(id)) 
        : true;
        
      const matchApp = filterAppType === '全部' ? true : r.appType === filterAppType;
      
      // Date filtering logic
      if (filterStartDate && filterEndDate) {
        const start = new Date(filterStartDate).getTime();
        const end = new Date(filterEndDate).getTime();
        const recordTime = new Date(r.latestConversationTime).getTime();
        if (recordTime < start || recordTime > end) return false;
      }
      
      return matchId && matchApp;
    });
  }, [records, filterUserId, filterAppType, filterStartDate, filterEndDate]);

  const handleExport = async () => {
    if (filteredRecords.length === 0) {
      alert('没有可导出的数据');
      return;
    }

    // Validate date range (max 6 months)
    if (filterStartDate && filterEndDate) {
      const start = new Date(filterStartDate);
      const end = new Date(filterEndDate);
      const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      if (diffMonths > 6) {
        alert('选择日期范围不可超过6个月，请重新选择');
        return;
      }
    }

    setIsExporting(true);
    try {
      const targetUserIds = selectedIds.length > 0 
        ? records.filter(r => selectedIds.includes(r.id)).map(r => r.userId)
        : filteredRecords.map(r => r.userId);

      if (targetUserIds.length === 0) return;

      const q = query(
        collection(db, 'messages'), 
        where('userId', 'in', targetUserIds.slice(0, 10))
      );
      const snapshot = await getDocs(q);
      const messages = snapshot.docs.map(doc => doc.data()) as MessageRecord[];

      if (messages.length === 0) {
        alert('未找到对话内容');
        return;
      }

      const exportData = messages.map(m => {
        const row: any = {
          '用户ID': m.userId,
          '角色': m.role,
          '对话内容': m.content,
          '对话场景': m.scene || '日常对话',
          '对话语种': m.language || '未知',
          '对话时间': formatDate(m.timestamp)
        };
        return row;
      });

      exportToExcel(exportData, `用户对话记录_${new Date().getTime()}`);
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  const seedData = async () => {
    const apps = ['Spanish Ai', 'Japanese Ai', 'Talksy'];
    const scenes = ['日常对话', '职场英语', '翻译', '旅行'];
    
    const mockContent: Record<string, { lang: string, user: string[], ai: string[] }> = {
      'Spanish Ai': {
        lang: 'Spanish',
        user: ['Hola, ¿cómo estás?', 'Me gustaría aprender español.'],
        ai: ['¡Hola! Estoy muy bien, gracias. ¿En qué puedo ayudarte?', '¡Excelente! El español es un idioma hermoso.']
      },
      'Japanese Ai': {
        lang: 'Japanese',
        user: ['こんにちは、お元気ですか？', '日本語を勉強したいです。'],
        ai: ['こんにちは！私は元気です。何かお手伝いしましょうか？', '素晴らしいですね！日本語はとても面白い言語ですよ。']
      },
      'Talksy': {
        lang: 'English', // Talksy has 22 languages, defaulting to English for mock
        user: ['Hello, I want to practice English.', 'Can you help me with my pronunciation?'],
        ai: ['Sure! I can definitely help you with that.', 'Of course! Let\'s start with some basic sounds.']
      }
    };

    const talksyLangs = ['English', 'French', 'German', 'Italian', 'Portuguese', 'Russian', 'Chinese', 'Korean', 'Arabic'];
    
    for (let i = 0; i < 5; i++) {
      const userId = `user_${Math.floor(Math.random() * 100000)}`;
      const appType = apps[Math.floor(Math.random() * apps.length)];
      const config = mockContent[appType];
      const language = appType === 'Talksy' ? talksyLangs[Math.floor(Math.random() * talksyLangs.length)] : config.lang;
      
      await addDoc(collection(db, 'users'), {
        userId,
        appType,
        registrationTime: new Date().toISOString(),
        conversationRounds: Math.floor(Math.random() * 50),
        latestConversationTime: new Date().toISOString()
      });

      const userMsg = config.user[Math.floor(Math.random() * config.user.length)];
      const aiMsg = config.ai[Math.floor(Math.random() * config.ai.length)];

      await addDoc(collection(db, 'messages'), {
        userId,
        appType,
        role: 'User',
        content: userMsg,
        scene: scenes[Math.floor(Math.random() * scenes.length)],
        language,
        timestamp: new Date().toISOString()
      });
      await addDoc(collection(db, 'messages'), {
        userId,
        appType,
        role: 'AI',
        content: aiMsg,
        scene: scenes[Math.floor(Math.random() * scenes.length)],
        language,
        timestamp: new Date().toISOString()
      });
    }
    alert('模拟数据已生成，且语种已匹配');
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">AI CMS Backend</h1>
        </div>
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl shadow-gray-200/50">
          <h2 className="mb-2 text-xl font-semibold text-gray-900">管理员登录</h2>
          <p className="mb-8 text-gray-500">请使用管理员账号登录以访问后台管理系统。</p>
          <button
            onClick={handleLogin}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-blue-600 px-4 py-3 font-medium text-white transition-all hover:bg-blue-700 active:scale-[0.98]"
          >
            <img src="https://www.google.com/favicon.ico" className="h-5 w-5 rounded-full bg-white p-0.5" alt="Google" />
            使用 Google 账号登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F0F2F5] font-sans text-gray-900">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col bg-[#001529] text-gray-400">
        <div className="flex h-16 items-center gap-3 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 text-white">
            <Database size={18} />
          </div>
          <span className="text-lg font-bold text-white">HelloTalk CMS</span>
        </div>
        
        <nav className="flex-1 space-y-1 px-3 py-4">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            核心管理
          </div>
          <SidebarItem 
            icon={<LayoutDashboard size={18} />} 
            label="工作台" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')}
          />
          
          <div className="mt-6 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            用户管理
          </div>
          <SidebarItem 
            icon={<Users size={18} />} 
            label="用户列表" 
            active={activeTab === 'users'} 
            onClick={() => setActiveTab('users')}
          />
          <SidebarItem 
            icon={<MessageSquare size={18} />} 
            label="用户对话内容" 
            active={activeTab === 'conversations'} 
            onClick={() => setActiveTab('conversations')}
          />
          
          <div className="mt-6 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            系统设置
          </div>
          <SidebarItem 
            icon={<Settings size={18} />} 
            label="权限配置" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')}
          />
        </nav>

        <div className="border-t border-gray-800 p-4">
          <div className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/5">
            <img src={user.photoURL || ''} className="h-8 w-8 rounded-full" alt="User" />
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-white">{user.displayName}</p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-500 hover:text-white">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between bg-white px-8 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>课程管理</span>
            <ChevronRight size={14} />
            <span>Language AI</span>
            <ChevronRight size={14} />
            <span className="font-medium text-gray-900">用户对话内容</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={seedData}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              生成模拟数据
            </button>
            <div className="h-8 w-px bg-gray-200"></div>
            <span className="text-sm font-medium text-gray-700">正式环境</span>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Tabs Bar */}
          <div className="mb-4 flex gap-1">
            <div className="rounded-t-lg bg-white px-4 py-2 text-sm font-medium text-blue-600 shadow-sm">
              用户对话内容 <span className="ml-2 text-gray-400">×</span>
            </div>
          </div>

          {/* Filter Section */}
          <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">用户ID</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input 
                    type="text" 
                    placeholder="支持单个或多个ID输入，多个ID需用英文或中文逗号隔开"
                    value={filterUserId}
                    onChange={(e) => setFilterUserId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">应用类型</label>
                <div className="relative">
                  <select 
                    value={filterAppType}
                    onChange={(e) => setFilterAppType(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-gray-200 py-2 pl-4 pr-10 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option>全部</option>
                    <option>Spanish Ai</option>
                    <option>Japanese Ai</option>
                    <option>Talksy</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">对话时间</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="date" 
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                  <span className="text-gray-400">至</span>
                  <div className="relative flex-1">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="date" 
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-red-500 mt-1">不可超过6个月，避免数据过多</p>
              </div>

              <div className="flex items-end gap-3">
                <button className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition-all hover:bg-blue-700 active:scale-[0.98]">
                  查询
                </button>
                <button 
                  onClick={() => {
                    setFilterUserId('');
                    setFilterAppType('全部');
                    setFilterStartDate('');
                    setFilterEndDate('');
                  }}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  <RotateCcw size={16} />
                  重置
                </button>
              </div>
            </div>
          </section>

          {/* Table Section */}
          <section className="rounded-xl bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900">LanguageAI用户对话列表</h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleExport}
                  disabled={isExporting}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Download size={16} />
                  {isExporting ? '导出中...' : '导出'}
                </button>
                <button className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-gray-50">
                  <Filter size={16} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedIds.length === filteredRecords.length && filteredRecords.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(filteredRecords.map(r => r.id));
                          } else {
                            setSelectedIds([]);
                          }
                        }}
                      />
                    </th>
                    <th className="px-6 py-4">用户ID</th>
                    <th className="px-6 py-4">应用类型</th>
                    <th className="px-6 py-4">最新对话时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRecords.map((record) => (
                    <tr key={record.id} className="transition-colors hover:bg-gray-50/50">
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={selectedIds.includes(record.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds([...selectedIds, record.id]);
                            } else {
                              setSelectedIds(selectedIds.filter(id => id !== record.id));
                            }
                          }}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold text-xs">
                            {record.userId.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">{record.userId}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                          {record.appType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {formatDate(record.latestConversationTime)}
                      </td>
                    </tr>
                  ))}
                  {filteredRecords.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                        暂无符合条件的对话记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6 py-4">
              <p className="text-xs text-gray-500">共 {filteredRecords.length} 条数据</p>
              <div className="flex items-center gap-2">
                <button className="rounded border border-gray-200 bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50">上一页</button>
                <div className="flex gap-1">
                  <button className="h-6 w-6 rounded bg-blue-600 text-xs text-white">1</button>
                </div>
                <button className="rounded border border-gray-200 bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50">下一页</button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
        active ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
