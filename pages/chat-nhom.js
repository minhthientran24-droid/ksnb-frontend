import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  listChatGroups, listChatMessages, sendChatMessage, getChatWsUrl,
  createChatGroup, updateChatGroup, deleteChatGroup, getChatGroupMembers,
  downloadChatMessageFile, listUsers, getUser,
} from "../lib/api";

const ADMIN_ROLES = ["admin", "super_admin"];

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? hm : `${d.toLocaleDateString("vi-VN")} ${hm}`;
}

function GroupFormModal({ initial, allUsers, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [selected, setSelected] = useState(new Set(initial?.memberIds || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  async function handleSave() {
    if (!name.trim()) { setError("Tên nhóm không được để trống"); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), memberIds: Array.from(selected) });
      onClose();
    } catch (err) {
      setError(err.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-overlay" onClick={onClose}>
      <div className="chat-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="chat-modal-head">
          <h3>{initial ? "Sửa nhóm chat" : "Tạo nhóm chat mới"}</h3>
          <button className="chat-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="chat-modal-body">
          <label className="flabel">Tên nhóm</label>
          <input className="finput" style={{ width: "100%", marginBottom: 14 }} value={name} onChange={(e) => setName(e.target.value)} />
          <label className="flabel">Thành viên ({selected.size} đã chọn)</label>
          <div className="chat-member-picker">
            {allUsers.map((u) => (
              <label key={u.id} className="chat-member-row">
                <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                <span>{u.full_name} <span className="chat-member-email">({u.email})</span></span>
              </label>
            ))}
          </div>
          {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="login-btn" style={{ width: "auto", padding: "9px 20px", margin: 0 }} disabled={saving} onClick={handleSave}>
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
            <button className="fbtn" onClick={onClose}>Hủy</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatNhomPage() {
  const me = getUser();
  const isAdmin = me && ADMIN_ROLES.includes(me.role);

  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [wsStatus, setWsStatus] = useState("connecting"); // connecting | open | closed

  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null); // group đang sửa (null = tạo mới)
  const [allUsers, setAllUsers] = useState([]);

  const wsRef = useRef(null);
  const listEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeGroupIdRef = useRef(null);
  activeGroupIdRef.current = activeGroupId;

  function loadGroups() {
    listChatGroups().then((data) => {
      setGroups(data);
      setActiveGroupId((prev) => prev ?? (data.find((g) => g.is_default)?.id ?? data[0]?.id ?? null));
    }).catch((err) => setError(err.message));
  }

  useEffect(() => { loadGroups(); }, []);

  // ---------- WebSocket real-time ----------
  useEffect(() => {
    let cancelled = false;
    let reconnectTimer = null;

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(getChatWsUrl());
      wsRef.current = ws;
      ws.onopen = () => setWsStatus("open");
      ws.onclose = () => {
        setWsStatus("closed");
        if (!cancelled) reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (evt) => {
        let payload;
        try { payload = JSON.parse(evt.data); } catch { return; }
        if (payload.type !== "message") return;
        if (payload.group_id === activeGroupIdRef.current) {
          setMessages((prev) => [...prev, payload.message]);
        }
        // Cập nhật preview + đưa nhóm có tin mới lên đầu danh sách
        setGroups((prev) => {
          const idx = prev.findIndex((g) => g.id === payload.group_id);
          if (idx === -1) return prev;
          const updated = { ...prev[idx], last_message_preview: payload.message.content || (payload.message.file_name ? `📎 ${payload.message.file_name}` : "Tệp đính kèm"), last_message_at: payload.message.created_at };
          const rest = prev.filter((g) => g.id !== payload.group_id);
          return [updated, ...rest];
        });
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  // ---------- Nạp lịch sử khi đổi nhóm ----------
  useEffect(() => {
    if (!activeGroupId) return;
    setMessages([]);
    setHasMore(false);
    listChatMessages(activeGroupId).then((rows) => {
      setMessages(rows);
      setHasMore(rows.length >= 50);
    }).catch((err) => setError(err.message));
  }, [activeGroupId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function loadOlder() {
    if (!messages.length) return;
    const rows = await listChatMessages(activeGroupId, messages[0].id);
    setMessages((prev) => [...rows, ...prev]);
    setHasMore(rows.length >= 50);
  }

  async function handleSend() {
    if (!text.trim() && !file) return;
    setSending(true);
    setError("");
    try {
      await sendChatMessage(activeGroupId, { content: text, file });
      setText("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err.message || "Gửi tin nhắn thất bại");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function openCreateGroup() {
    if (allUsers.length === 0) listUsers().then(setAllUsers).catch(() => {});
    setEditingGroup(null);
    setShowGroupForm(true);
  }

  async function openEditGroup(g) {
    const users = allUsers.length ? allUsers : await listUsers().then((u) => { setAllUsers(u); return u; });
    const members = await getChatGroupMembers(g.id);
    setEditingGroup({ id: g.id, name: g.name, memberIds: members.map((m) => m.id) });
    setShowGroupForm(true);
  }

  async function handleSaveGroup({ name, memberIds }) {
    if (editingGroup) {
      await updateChatGroup(editingGroup.id, { name, memberIds });
    } else {
      await createChatGroup({ name, memberIds });
    }
    loadGroups();
  }

  async function handleDeleteGroup(g) {
    if (!confirm(`Xóa nhóm "${g.name}"? Toàn bộ tin nhắn trong nhóm sẽ mất.`)) return;
    try {
      await deleteChatGroup(g.id);
      if (activeGroupId === g.id) setActiveGroupId(null);
      loadGroups();
    } catch (err) {
      alert(err.message || "Xóa thất bại");
    }
  }

  const activeGroup = groups.find((g) => g.id === activeGroupId);

  return (
    <Layout crumb="Chat nhóm">
      <div className="page-head">
        <h1>Chat nhóm</h1>
        <p>
          Nhóm "All" gồm toàn bộ tài khoản đang hoạt động.
          {isAdmin && " Admin tạo thêm được các nhóm riêng và chọn thành viên."}
          {" "}
          <span style={{ color: wsStatus === "open" ? "#1a8a4a" : "var(--text-400)" }}>
            {wsStatus === "open" ? "● Đang kết nối" : "○ Mất kết nối, đang thử lại..."}
          </span>
        </p>
      </div>

      {error && <div className="placeholder-box">{error}</div>}

      <div className="chat-shell">
        <div className="chat-sidebar">
          {isAdmin && (
            <button className="upload-btn" style={{ width: "100%", marginBottom: 10 }} onClick={openCreateGroup}>
              + Nhóm mới
            </button>
          )}
          <div className="chat-group-list">
            {groups.map((g) => (
              <div key={g.id} className={`chat-group-row ${g.id === activeGroupId ? "active" : ""}`} onClick={() => setActiveGroupId(g.id)}>
                <div className="chat-group-avatar">{g.is_default ? "🌐" : "#"}</div>
                <div className="chat-group-info">
                  <div className="chat-group-name">{g.name}</div>
                  <div className="chat-group-preview">{g.last_message_preview || "Chưa có tin nhắn"}</div>
                </div>
                {isAdmin && !g.is_default && (
                  <div className="chat-group-actions">
                    <button className="chat-icon-btn" title="Sửa nhóm" onClick={(e) => { e.stopPropagation(); openEditGroup(g); }}>⚙</button>
                    <button className="chat-icon-btn" title="Xóa nhóm" onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g); }}>🗑</button>
                  </div>
                )}
              </div>
            ))}
            {groups.length === 0 && <div className="note" style={{ padding: 14 }}>Đang tải danh sách nhóm...</div>}
          </div>
        </div>

        <div className="chat-main">
          {activeGroup ? (
            <>
              <div className="chat-main-head">
                <div className="chat-group-avatar">{activeGroup.is_default ? "🌐" : "#"}</div>
                <div>
                  <div className="chat-group-name">{activeGroup.name}</div>
                  <div className="note">{activeGroup.member_count} thành viên</div>
                </div>
              </div>

              <div className="chat-messages">
                {hasMore && (
                  <div style={{ textAlign: "center", marginBottom: 10 }}>
                    <button className="fbtn" onClick={loadOlder}>Xem tin nhắn cũ hơn</button>
                  </div>
                )}
                {messages.map((m) => {
                  const isMe = m.sender_id === me?.id;
                  return (
                    <div key={m.id} className={`chat-msg-row ${isMe ? "me" : ""}`}>
                      {!isMe && <div className="chat-msg-sender">{m.sender_name}</div>}
                      <div className={`chat-bubble ${isMe ? "me" : ""}`}>
                        {m.content && <div className="chat-bubble-text">{m.content}</div>}
                        {m.has_file && (
                          <button className="chat-file-chip" onClick={() => downloadChatMessageFile(m.id, m.file_name)}>
                            📎 {m.file_name || "Tệp đính kèm"}
                          </button>
                        )}
                        <div className="chat-bubble-time">{fmtTime(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={listEndRef} />
              </div>

              <div className="chat-input-bar">
                <button className="chat-icon-btn" title="Đính kèm file" onClick={() => fileInputRef.current?.click()}>📎</button>
                <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <textarea
                  className="chat-textarea"
                  rows={1}
                  placeholder={file ? `Đính kèm: ${file.name}` : "Nhập tin nhắn..."}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button className="login-btn" style={{ width: "auto", padding: "9px 20px", margin: 0 }} disabled={sending} onClick={handleSend}>
                  Gửi
                </button>
              </div>
            </>
          ) : (
            <div className="note" style={{ padding: 30, textAlign: "center" }}>Chọn 1 nhóm để bắt đầu chat</div>
          )}
        </div>
      </div>

      {showGroupForm && (
        <GroupFormModal
          initial={editingGroup}
          allUsers={allUsers}
          onClose={() => setShowGroupForm(false)}
          onSave={handleSaveGroup}
        />
      )}

      <style jsx global>{`
        .chat-shell { display: flex; gap: 14px; height: calc(100vh - 200px); min-height: 480px; }
        .chat-sidebar { width: 300px; flex-shrink: 0; background: var(--card); border-radius: var(--radius); border: 1px solid var(--border); padding: 12px; overflow-y: auto; }
        .chat-group-list { display: flex; flex-direction: column; gap: 4px; }
        .chat-group-row { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 8px; cursor: pointer; }
        .chat-group-row:hover { background: var(--bg); }
        .chat-group-row.active { background: var(--blue-accent); }
        .chat-group-row.active .chat-group-name, .chat-group-row.active .chat-group-preview { color: #fff; }
        .chat-group-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--navy-800); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
        .chat-group-info { flex: 1; min-width: 0; }
        .chat-group-name { font-weight: 700; font-size: 13.5px; color: var(--text-900); }
        .chat-group-preview { font-size: 12px; color: var(--text-600); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chat-group-actions { display: flex; gap: 4px; }
        .chat-icon-btn { background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px 6px; border-radius: 6px; }
        .chat-icon-btn:hover { background: rgba(0,0,0,0.06); }

        .chat-main { flex: 1; display: flex; flex-direction: column; background: var(--card); border-radius: var(--radius); border: 1px solid var(--border); overflow: hidden; min-width: 0; }
        .chat-main-head { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
        .chat-messages { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
        .chat-msg-row { display: flex; flex-direction: column; align-items: flex-start; max-width: 70%; }
        .chat-msg-row.me { align-self: flex-end; align-items: flex-end; }
        .chat-msg-sender { font-size: 11.5px; color: var(--text-400); margin-bottom: 2px; margin-left: 4px; }
        .chat-bubble { background: var(--bg); border-radius: 14px; padding: 9px 13px; }
        .chat-bubble.me { background: var(--blue-accent); color: #fff; }
        .chat-bubble-text { font-size: 13.5px; white-space: pre-wrap; word-break: break-word; }
        .chat-bubble-time { font-size: 10px; opacity: 0.7; margin-top: 4px; text-align: right; }
        .chat-file-chip { display: block; margin-top: 6px; background: rgba(255,255,255,0.5); border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; padding: 6px 10px; font-size: 12.5px; cursor: pointer; text-align: left; }
        .chat-bubble.me .chat-file-chip { background: rgba(255,255,255,0.18); border-color: rgba(255,255,255,0.3); color: #fff; }

        .chat-input-bar { display: flex; align-items: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); }
        .chat-textarea { flex: 1; resize: none; border: 1.5px solid var(--border); border-radius: 10px; padding: 9px 12px; font-size: 13.5px; font-family: inherit; max-height: 100px; }

        .chat-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
        .chat-modal-card { background: var(--card); border-radius: var(--radius); width: 100%; max-width: 460px; max-height: 85vh; overflow-y: auto; }
        .chat-modal-head { padding: 18px 22px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .chat-modal-head h3 { font-size: 15px; font-weight: 800; color: var(--navy-900); }
        .chat-modal-close { background: none; border: none; font-size: 15px; cursor: pointer; color: var(--text-400); }
        .chat-modal-body { padding: 20px 22px; }
        .chat-member-picker { max-height: 220px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
        .chat-member-row { display: flex; align-items: center; gap: 8px; padding: 6px 4px; font-size: 13px; cursor: pointer; }
        .chat-member-email { color: var(--text-400); font-size: 11.5px; }
      `}</style>
    </Layout>
  );
}
