import React, { useState, useEffect } from 'react';
import { auth, loginWithGoogle, logoutUser } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { BookOpen, Sparkles, MapPin, Shield, Bell, LogIn, LogOut, Heart } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('journal');
  const [entries, setEntries] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [locationStr, setLocationStr] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adminStats, setAdminStats] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchEntries(currentUser);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchEntries = async (currentUser) => {
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch('/api/entries', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch (err) {
      console.error('Fetch entries error:', err);
    }
  };

  const handleDetectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const coords = `Lat: ${pos.coords.latitude.toFixed(4)}, Lng: ${pos.coords.longitude.toFixed(4)}`;
        setLocationStr(coords);
      });
    }
  };

  const handleSaveEntry = async (e) => {
    e.preventDefault();
    if (!newContent.trim() || !user) return;
    setLoading(true);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newTitle,
          content: newContent,
          location: locationStr ? { name: locationStr } : null
        })
      });

      if (res.ok) {
        setNewTitle('');
        setNewContent('');
        setLocationStr('');
        fetchEntries(user);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim() || !user) return;

    const userMsg = chatMessage;
    setChatHistory((prev) => [...prev, { role: 'user', text: userMsg }]);
    setChatMessage('');

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: userMsg, history: chatHistory })
      });

      if (res.ok) {
        const data = await res.json();
        setChatHistory((prev) => [...prev, { role: 'model', text: data.reply }]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAdminStats = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminStats(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600 rounded-xl">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              MindReflect AI
            </span>
          </div>

          <nav className="flex items-center space-x-1">
            <button
              onClick={() => setActiveTab('journal')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === 'journal' ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Journal & Insights
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === 'chat' ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              AI Companion
            </button>
            <button
              onClick={() => { setActiveTab('admin'); fetchAdminStats(); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === 'admin' ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Admin RBAC
            </button>
          </nav>

          <div>
            {user ? (
              <div className="flex items-center space-x-3">
                <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-full border border-indigo-500" />
                <button
                  onClick={logoutUser}
                  className="p-2 text-slate-400 hover:text-rose-400 transition"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
              >
                <LogIn className="w-4 h-4" />
                <span>Google Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Body Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {!user ? (
          <div className="text-center py-20 bg-slate-800/40 rounded-3xl border border-slate-800 p-8">
            <Shield className="w-16 h-16 text-indigo-400 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-white mb-2">Secure AI Journaling on Cloud Run</h1>
            <p className="text-slate-400 max-w-lg mx-auto mb-6">
              Authenticated with Firebase, powered by Gemini 2.5 Flash, backed by isolated Firestore security rules.
            </p>
            <button
              onClick={loginWithGoogle}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-8 py-3 rounded-2xl font-medium shadow-lg transition"
            >
              Get Started with Google Auth
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'journal' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Editor Section */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-6 shadow-xl">
                    <h2 className="text-lg font-semibold mb-4 flex items-center space-x-2 text-indigo-400">
                      <BookOpen className="w-5 h-5" />
                      <span>New Reflection</span>
                    </h2>

                    <form onSubmit={handleSaveEntry} className="space-y-4">
                      <input
                        type="text"
                        placeholder="Title your entry..."
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />

                      <textarea
                        rows={5}
                        placeholder="Write freely... Gemini will analyze sentiment & suggest reflection prompts automatically."
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />

                      <div className="flex items-center justify-between pt-2">
                        <button
                          type="button"
                          onClick={handleDetectLocation}
                          className="flex items-center space-x-1.5 text-xs text-indigo-400 bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-800/50 px-3 py-1.5 rounded-lg transition"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{locationStr || 'Add Geolocation Tag'}</span>
                        </button>

                        <button
                          type="submit"
                          disabled={loading}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl text-sm font-medium shadow-md transition disabled:opacity-50"
                        >
                          {loading ? 'Analyzing with Gemini...' : 'Save & Analyze Entry'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                {/* Entry Feed Section */}
                <div className="lg:col-span-5 space-y-4">
                  <h2 className="text-lg font-semibold text-slate-300">Your Private Reflections</h2>
                  {entries.length === 0 ? (
                    <p className="text-slate-500 text-sm italic">No entries yet. Create your first reflection!</p>
                  ) : (
                    entries.map((item) => (
                      <div key={item.id} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 space-y-3">
                        <div className="flex items-start justify-between">
                          <h3 className="font-semibold text-white">{item.title}</h3>
                          {item.aiInsight?.sentiment && (
                            <span className="text-xs bg-purple-950/60 border border-purple-800/50 text-purple-300 px-2.5 py-0.5 rounded-full capitalize">
                              {item.aiInsight.sentiment}
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-slate-300 line-clamp-3">{item.content}</p>

                        {item.location?.name && (
                          <div className="flex items-center space-x-1 text-xs text-emerald-400">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{item.location.name}</span>
                          </div>
                        )}

                        {item.aiInsight?.aiReflectionPrompt && (
                          <div className="bg-indigo-950/30 border border-indigo-900/40 rounded-xl p-3 text-xs text-indigo-300">
                            <span className="font-semibold text-indigo-400">Gemini Insight Prompt: </span>
                            {item.aiInsight.aiReflectionPrompt}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="max-w-3xl mx-auto bg-slate-800/50 border border-slate-700/60 rounded-2xl p-6 shadow-2xl flex flex-col h-[550px]">
                <div className="flex items-center space-x-2 border-b border-slate-700 pb-4 mb-4">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                  <h2 className="font-semibold text-white">MindReflect AI Companion (Gemini 2.5 Flash)</h2>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  {chatHistory.length === 0 ? (
                    <p className="text-center text-slate-500 text-sm mt-20">
                      Say hello! MindReflect AI is ready to discuss your goals, feelings, and journal insights.
                    </p>
                  ) : (
                    chatHistory.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                          msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-700/70 text-slate-200 border border-slate-600'
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleSendChat} className="flex items-center space-x-2 pt-4 border-t border-slate-700">
                  <input
                    type="text"
                    placeholder="Type your message to Gemini..."
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium">
                    Send
                  </button>
                </form>
              </div>
            )}

            {activeTab === 'admin' && (
              <div className="max-w-4xl mx-auto bg-slate-800/50 border border-slate-700/60 rounded-2xl p-6">
                <div className="flex items-center justify-between border-b border-slate-700 pb-4 mb-6">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-6 h-6 text-indigo-400" />
                    <h2 className="text-xl font-bold text-white">Role-Based Admin Dashboard</h2>
                  </div>
                  <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800 px-3 py-1 rounded-full font-mono">
                    Challenge Label: dev-tutorial=cloud-run-ai-challenge
                  </span>
                </div>

                {adminStats ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-900/60 border border-slate-700 p-5 rounded-xl">
                      <div className="text-slate-400 text-xs uppercase font-medium">Total Registered Users</div>
                      <div className="text-3xl font-bold text-indigo-400 mt-2">{adminStats.totalUsers}</div>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-700 p-5 rounded-xl">
                      <div className="text-slate-400 text-xs uppercase font-medium">Total Journal Reflections</div>
                      <div className="text-3xl font-bold text-purple-400 mt-2">{adminStats.totalEntries}</div>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-700 p-5 rounded-xl">
                      <div className="text-slate-400 text-xs uppercase font-medium">Deployment Platform</div>
                      <div className="text-lg font-semibold text-emerald-400 mt-2">{adminStats.cloudRunRegion}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400 text-center py-8">Loading admin metrics... (Verify user has admin role in Firestore)</div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
