import { useState, useEffect, useCallback } from "react";

const PRIORITIES = {
  critical: { label: "CRITICAL", color: "#FF2D55", bg: "rgba(255,45,85,0.12)", rank: 0 },
  high:     { label: "HIGH",     color: "#FF9500", bg: "rgba(255,149,0,0.12)",  rank: 1 },
  medium:   { label: "MEDIUM",   color: "#FFD60A", bg: "rgba(255,214,10,0.12)", rank: 2 },
  low:      { label: "LOW",      color: "#30D158", bg: "rgba(48,209,88,0.12)",  rank: 3 },
};

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');`;

function getUrgencyScore(task) {
  const now = Date.now();
  const deadline = new Date(task.deadline).getTime();
  const hoursLeft = (deadline - now) / 3600000;
  const priorityBonus = (3 - PRIORITIES[task.priority].rank) * 48;
  return hoursLeft - priorityBonus;
}

function formatCountdown(deadline) {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff < 0) return { text: "OVERDUE", overdue: true };
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  const rem = h % 24;
  if (d > 0) return { text: `${d}d ${rem}h`, overdue: false };
  if (h > 0) return { text: `${h}h ${Math.floor((diff % 3600000) / 60000)}m`, overdue: false };
  return { text: `${Math.floor(diff / 60000)}m`, overdue: false, urgent: true };
}

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const defaultTasks = [
  { id: 1, title: "Review Q1 product roadmap", assignedBy: "Sarah K.", deadline: new Date(Date.now() + 2 * 3600000).toISOString().slice(0,16), priority: "critical", done: false },
  { id: 2, title: "Finalize design mockups for onboarding", assignedBy: "Marco D.", deadline: new Date(Date.now() + 26 * 3600000).toISOString().slice(0,16), priority: "high", done: false },
  { id: 3, title: "Update API documentation", assignedBy: "Priya N.", deadline: new Date(Date.now() + 72 * 3600000).toISOString().slice(0,16), priority: "medium", done: false },
  { id: 4, title: "Reply to investor memo", assignedBy: "Chris W.", deadline: new Date(Date.now() - 1 * 3600000).toISOString().slice(0,16), priority: "high", done: false },
];

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const [notifGranted, setNotifGranted] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [form, setForm] = useState({ title: "", assignedBy: "", deadline: "", priority: "high" });
  const [loaded, setLoaded] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Load from storage
  useEffect(() => {
    async function load() {
      try {
        const res = await window.storage.get("tasks");
        if (res?.value) setTasks(JSON.parse(res.value));
        else setTasks(defaultTasks);
      } catch {
        setTasks(defaultTasks);
      }
      setLoaded(true);
    }
    load();
  }, []);

  // Save to storage
  useEffect(() => {
    if (!loaded) return;
    window.storage.set("tasks", JSON.stringify(tasks)).catch(() => {});
  }, [tasks, loaded]);

  // Request notifications
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "granted") setNotifGranted(true);
  }, []);

  const requestNotif = async () => {
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setNotifGranted(true);
      addToast("Reminders enabled! You'll be notified 1 hour before deadlines.", "success");
    }
  };

  // Check for upcoming deadlines every minute
  useEffect(() => {
    if (!notifGranted) return;
    const check = () => {
      tasks.filter(t => !t.done).forEach(t => {
        const hoursLeft = (new Date(t.deadline).getTime() - Date.now()) / 3600000;
        if (hoursLeft > 0 && hoursLeft <= 1) {
          const key = `notified_${t.id}`;
          if (!sessionStorage.getItem(key)) {
            new Notification(`⏰ Deadline in < 1 hour`, { body: t.title, icon: "https://fav.farm/⚡" });
            sessionStorage.setItem(key, "1");
          }
        }
      });
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [tasks, notifGranted]);

  // Countdown re-render
  const [tick, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 30000); return () => clearInterval(iv); }, []);

  const addToast = useCallback((msg, type = "info") => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  const sortedTasks = [...tasks]
    .filter(t => filter === "all" ? true : filter === "done" ? t.done : !t.done)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return getUrgencyScore(a) - getUrgencyScore(b);
    });

  const addTask = () => {
    if (!form.title.trim() || !form.deadline) { addToast("Title and deadline are required.", "error"); return; }
    const task = { id: Date.now(), ...form, done: false };
    setTasks(p => [...p, task]);
    setForm({ title: "", assignedBy: "", deadline: "", priority: "high" });
    setShowForm(false);
    addToast("Task added.", "success");
  };

  const toggleDone = (id) => setTasks(p => p.map(t => t.id === id ? { ...t, done: !t.done } : t));

  const deleteTask = async (id) => {
    setDeletingId(id);
    await new Promise(r => setTimeout(r, 300));
    setTasks(p => p.filter(t => t.id !== id));
    setDeletingId(null);
    addToast("Task removed.", "info");
  };

  const pendingCount = tasks.filter(t => !t.done).length;
  const overdueCount = tasks.filter(t => !t.done && new Date(t.deadline) < new Date()).length;
  const criticalCount = tasks.filter(t => !t.done && t.priority === "critical").length;

  return (
    <>
      <style>{FONTS}{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0c; color: #e8e8e8; font-family: 'DM Sans', sans-serif; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

        .app { min-height: 100vh; background: #0a0a0c; padding: 0 0 60px; }

        /* Header */
        .header { border-bottom: 1px solid #1e1e22; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; background: rgba(10,10,12,0.92); backdrop-filter: blur(12px); z-index: 100; }
        .header-left { display: flex; align-items: baseline; gap: 16px; }
        .logo { font-family: 'DM Mono', monospace; font-size: 13px; color: #555; letter-spacing: 0.12em; text-transform: uppercase; }
        .header-title { font-size: 18px; font-weight: 600; color: #f0f0f0; letter-spacing: -0.02em; }
        .header-actions { display: flex; gap: 10px; align-items: center; }

        /* Stats bar */
        .stats { display: flex; gap: 1px; background: #1e1e22; border-bottom: 1px solid #1e1e22; }
        .stat { flex: 1; padding: 16px 24px; background: #0e0e11; display: flex; flex-direction: column; gap: 4px; }
        .stat-val { font-family: 'DM Mono', monospace; font-size: 28px; font-weight: 500; line-height: 1; }
        .stat-label { font-size: 11px; color: #555; letter-spacing: 0.08em; text-transform: uppercase; }

        /* Filters */
        .filters { padding: 16px 32px; display: flex; gap: 6px; border-bottom: 1px solid #1a1a1e; }
        .filter-btn { font-family: 'DM Mono', monospace; font-size: 11px; padding: 6px 14px; border-radius: 20px; border: 1px solid #2a2a30; background: transparent; color: #777; cursor: pointer; letter-spacing: 0.06em; text-transform: uppercase; transition: all 0.15s; }
        .filter-btn:hover { border-color: #444; color: #bbb; }
        .filter-btn.active { background: #1e1e26; border-color: #444; color: #e0e0e0; }

        /* Task list */
        .task-list { padding: 16px 32px; display: flex; flex-direction: column; gap: 2px; }
        .empty { text-align: center; padding: 80px 20px; color: #333; font-family: 'DM Mono', monospace; font-size: 13px; letter-spacing: 0.08em; }

        /* Task card */
        .task-card { display: flex; align-items: stretch; border: 1px solid #1a1a1e; border-radius: 8px; overflow: hidden; background: #0e0e11; transition: all 0.2s; cursor: default; }
        .task-card:hover { border-color: #2a2a30; background: #111115; }
        .task-card.done-card { opacity: 0.4; }
        .task-card.deleting { opacity: 0; transform: translateX(20px); }
        .priority-bar { width: 3px; flex-shrink: 0; }
        .task-body { flex: 1; padding: 14px 16px; display: flex; align-items: center; gap: 14px; }
        .check-btn { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid #333; background: transparent; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
        .check-btn:hover { border-color: #30D158; }
        .check-btn.checked { background: #30D158; border-color: #30D158; }
        .task-info { flex: 1; min-width: 0; }
        .task-title { font-size: 14px; font-weight: 500; color: #e0e0e0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
        .task-title.done-text { text-decoration: line-through; color: #444; }
        .task-meta { display: flex; align-items: center; gap: 12px; }
        .meta-item { font-family: 'DM Mono', monospace; font-size: 11px; color: #444; display: flex; align-items: center; gap: 4px; }
        .priority-badge { font-family: 'DM Mono', monospace; font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 500; letter-spacing: 0.06em; flex-shrink: 0; }
        .countdown { font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500; flex-shrink: 0; min-width: 80px; text-align: right; }
        .countdown.overdue { color: #FF2D55; animation: pulse 2s ease-in-out infinite; }
        .countdown.urgent { color: #FF9500; }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
        .delete-btn { background: none; border: none; color: #2a2a30; cursor: pointer; padding: 14px 14px; font-size: 16px; transition: color 0.15s; display: flex; align-items: center; }
        .delete-btn:hover { color: #FF2D55; }

        /* Buttons */
        .btn { font-family: 'DM Mono', monospace; font-size: 12px; padding: 9px 18px; border-radius: 6px; border: none; cursor: pointer; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 500; transition: all 0.15s; }
        .btn-primary { background: #e8e8e8; color: #0a0a0c; }
        .btn-primary:hover { background: #fff; }
        .btn-ghost { background: transparent; color: #777; border: 1px solid #2a2a30; }
        .btn-ghost:hover { border-color: #444; color: #bbb; }
        .btn-notif { background: transparent; border: 1px solid #FF9500; color: #FF9500; }
        .btn-notif:hover { background: rgba(255,149,0,0.1); }
        .btn-notif.active { background: rgba(255,149,0,0.1); }

        /* Modal / Form */
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 200; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); animation: fadeIn 0.15s ease; }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        .modal { background: #111115; border: 1px solid #2a2a30; border-radius: 12px; padding: 28px; width: 440px; max-width: calc(100vw - 32px); animation: slideUp 0.2s ease; }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        .modal-title { font-size: 16px; font-weight: 600; color: #f0f0f0; margin-bottom: 24px; letter-spacing: -0.02em; }
        .field { margin-bottom: 16px; }
        .label { font-family: 'DM Mono', monospace; font-size: 11px; color: #555; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; display: block; }
        .input { width: 100%; background: #0a0a0c; border: 1px solid #2a2a30; border-radius: 6px; padding: 10px 14px; color: #e0e0e0; font-family: 'DM Sans', sans-serif; font-size: 14px; outline: none; transition: border-color 0.15s; }
        .input:focus { border-color: #444; }
        .priority-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .priority-opt { padding: 8px 4px; border-radius: 6px; border: 1.5px solid #2a2a30; background: transparent; cursor: pointer; text-align: center; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.04em; transition: all 0.15s; }
        .modal-actions { display: flex; gap: 8px; margin-top: 24px; justify-content: flex-end; }

        /* Toasts */
        .toasts { position: fixed; bottom: 20px; right: 20px; display: flex; flex-direction: column; gap: 8px; z-index: 300; }
        .toast { font-family: 'DM Mono', monospace; font-size: 12px; padding: 10px 16px; border-radius: 6px; border: 1px solid #2a2a30; background: #111115; color: #bbb; letter-spacing: 0.04em; animation: slideIn 0.2s ease; }
        .toast.success { border-color: #30D158; color: #30D158; }
        .toast.error { border-color: #FF2D55; color: #FF2D55; }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px) } to { opacity: 1; transform: translateX(0) } }

        /* Urgency label */
        .urgency-section-label { font-family: 'DM Mono', monospace; font-size: 10px; color: #333; letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 0 4px; }
      `}</style>

      <div className="app">
        {/* Header */}
        <div className="header">
          <div className="header-left">
            <span className="logo">Mission Control</span>
            <span className="header-title">Your Tasks</span>
          </div>
          <div className="header-actions">
            {!notifGranted && (
              <button className="btn btn-notif" onClick={requestNotif}>⏰ Enable Reminders</button>
            )}
            {notifGranted && (
              <button className="btn btn-notif active" disabled>⏰ Reminders On</button>
            )}
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Task</button>
          </div>
        </div>

        {/* Stats */}
        <div className="stats">
          <div className="stat">
            <span className="stat-val" style={{ color: "#e8e8e8" }}>{pendingCount}</span>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat">
            <span className="stat-val" style={{ color: overdueCount > 0 ? "#FF2D55" : "#333" }}>{overdueCount}</span>
            <span className="stat-label">Overdue</span>
          </div>
          <div className="stat">
            <span className="stat-val" style={{ color: criticalCount > 0 ? "#FF2D55" : "#333" }}>{criticalCount}</span>
            <span className="stat-label">Critical</span>
          </div>
          <div className="stat">
            <span className="stat-val" style={{ color: "#30D158" }}>{tasks.filter(t => t.done).length}</span>
            <span className="stat-label">Completed</span>
          </div>
        </div>

        {/* Filters */}
        <div className="filters">
          {["all", "pending", "done"].map(f => (
            <button key={f} className={`filter-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>

        {/* Task List */}
        <div className="task-list">
          {sortedTasks.length === 0 && (
            <div className="empty">No tasks here. You're clear. 🎯</div>
          )}
          {sortedTasks.map(task => {
            const p = PRIORITIES[task.priority];
            const cd = formatCountdown(task.deadline);
            return (
              <div
                key={task.id}
                className={`task-card ${task.done ? "done-card" : ""} ${deletingId === task.id ? "deleting" : ""}`}
              >
                <div className="priority-bar" style={{ background: task.done ? "#222" : p.color }} />
                <div className="task-body">
                  <button
                    className={`check-btn ${task.done ? "checked" : ""}`}
                    onClick={() => toggleDone(task.id)}
                  >
                    {task.done && <span style={{ color: "#0a0a0c", fontSize: 11, fontWeight: 700 }}>✓</span>}
                  </button>
                  <div className="task-info">
                    <div className={`task-title ${task.done ? "done-text" : ""}`}>{task.title}</div>
                    <div className="task-meta">
                      {task.assignedBy && (
                        <span className="meta-item">👤 {task.assignedBy}</span>
                      )}
                      <span className="meta-item">📅 {formatDate(task.deadline)}</span>
                    </div>
                  </div>
                  <span
                    className="priority-badge"
                    style={{ color: p.color, background: p.bg }}
                  >
                    {p.label}
                  </span>
                  {!task.done && (
                    <span
                      className={`countdown ${cd.overdue ? "overdue" : cd.urgent ? "urgent" : ""}`}
                      style={!cd.overdue && !cd.urgent ? { color: "#555" } : {}}
                    >
                      {cd.text}
                    </span>
                  )}
                </div>
                <button className="delete-btn" onClick={() => deleteTask(task.id)}>✕</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Task Modal */}
      {showForm && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <div className="modal-title">Assign a New Task</div>
            <div className="field">
              <label className="label">Task Title *</label>
              <input className="input" placeholder="What needs to be done?" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} autoFocus />
            </div>
            <div className="field">
              <label className="label">Assigned By</label>
              <input className="input" placeholder="Team member name" value={form.assignedBy} onChange={e => setForm(p => ({ ...p, assignedBy: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Deadline *</label>
              <input className="input" type="datetime-local" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Priority</label>
              <div className="priority-grid">
                {Object.entries(PRIORITIES).map(([key, val]) => (
                  <button
                    key={key}
                    className="priority-opt"
                    style={{
                      borderColor: form.priority === key ? val.color : "#2a2a30",
                      color: form.priority === key ? val.color : "#555",
                      background: form.priority === key ? val.bg : "transparent",
                    }}
                    onClick={() => setForm(p => ({ ...p, priority: key }))}
                  >
                    {val.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addTask}>Add Task</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="toasts">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </>
  );
}
