import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import {
  listChatGroups, listChatMessages, sendChatMessage, getChatWsUrl,
  createChatGroup, updateChatGroup, deleteChatGroup, getChatGroupMembers,
  downloadChatMessageFile, fetchChatMessageImageUrl, reactToChatMessage,
  getMyChatNickname, updateMyChatNickname, listUsers, getUser,
} from "../lib/api";

const ADMIN_ROLES = ["admin", "super_admin"];

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
function isImageFile(filename) {
  return !!filename && IMAGE_EXT_RE.test(filename);
}

// Bộ cảm xúc thả vào tin nhắn — cố định giống Messenger (khác EMOJI_LIST
// dùng để GÕ vào nội dung tin nhắn, đây là REACT vào 1 tin nhắn có sẵn).
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function summarizeReactions(reactions, myId) {
  const counts = {};
  const names = {};
  let mine = null;
  (reactions || []).forEach((r) => {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    (names[r.emoji] = names[r.emoji] || []).push(r.user_name || "Ẩn danh");
    if (r.user_id === myId) mine = r.emoji;
  });
  return { counts, names, mine };
}

// Bộ icon mặt cười thường dùng — tự chọn tay, không lấy thư viện ngoài để
// không thêm dependency mới cho 1 tính năng nhỏ.
const EMOJI_LIST = [
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
  "😉", "😊", "😇", "🥰", "😍", "😘", "😋", "😛", "😜", "🤪",
  "🤨", "🧐", "😎", "🥳", "😏", "😒", "😞", "😔", "😢", "😭",
  "😤", "😠", "😡", "🤯", "😳", "🥵", "🥶", "😱", "😨", "🥺",
  "🤔", "🤭", "🤫", "😴", "🤤", "😷", "🤒", "🤕", "🤗", "🙄",
  "👍", "👎", "👏", "🙏", "💪", "🤝", "👋", "❤️", "🔥", "🎉",
];

// Sticker "meme" hoạt hình — tự dựng bằng emoji Unicode + CSS animation
// (KHÔNG dùng ảnh/GIF meme thật lấy từ phim/gameshow vì dính bản quyền),
// đặt tên/caption theo trend mạng xã hội VN cho vui. Gửi là 1 tin nhắn
// riêng (content = "[[sticker:id]]"), không trộn với chữ thường.
const STICKERS = [
  { id: "fire", emoji: "🔥", label: "Cháy quá", anim: "pulse" },
  { id: "lol", emoji: "😂", label: "Cười lăn", anim: "wiggle" },
  { id: "auto-dung", emoji: "👍", label: "Auto đúng", anim: "bounce" },
  { id: "chuan100", emoji: "💯", label: "Chuẩn 100", anim: "tada" },
  { id: "vo-tay", emoji: "🙌", label: "Vỗ tay", anim: "shake" },
  { id: "het-hon", emoji: "😱", label: "Hết hồn", anim: "shake" },
  { id: "xin-xo", emoji: "🎉", label: "Xịn xò", anim: "tada" },
  { id: "hong", emoji: "👀", label: "Hóng", anim: "wiggle" },
  { id: "no-nao", emoji: "🤯", label: "Nổ não", anim: "pulse" },
  { id: "chet-cuoi", emoji: "💀", label: "Chết cười", anim: "shake" },
  { id: "bay-len", emoji: "🚀", label: "Bay lên", anim: "bounce" },
  { id: "cam-ket", emoji: "🫡", label: "Cam kết", anim: "bounce" },
];
const STICKER_MAP = Object.fromEntries(STICKERS.map((s) => [s.id, s]));
const STICKER_RE = /^\[\[sticker:([\w-]+)\]\]$/;

// Preview ở sidebar không được hiện chuỗi thô "[[sticker:...]]" — đổi
// thành "emoji + tên" cho dễ hiểu.
function friendlyPreview(content) {
  if (!content) return content;
  const m = content.match(STICKER_RE);
  if (!m) return content;
  const s = STICKER_MAP[m[1]];
  return s ? `${s.emoji} ${s.label}` : content;
}

function normName(s) {
  return String(s == null ? "" : s).toLowerCase().trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/\s+/g, " ");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Tô đậm các đoạn "@Tên thành viên" khớp đúng tên trong danh sách thành
// viên nhóm hiện tại — so khớp NGUYÊN VĂN (không chuẩn hoá dấu) vì tin
// nhắn được chèn sẵn đúng "@" + full_name lúc chọn từ danh sách gợi ý.
function renderMessageContent(content, members) {
  if (!content) return null;
  const names = (members || []).map((m) => m.full_name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (names.length === 0) return content;
  const re = new RegExp(`@(${names.map(escapeRegExp).join("|")})`, "g");
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index));
    parts.push(<span key={key++} className="chat-mention">{match[0]}</span>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return parts;
}

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

function NicknameModal({ initial, onClose, onSave }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [nickname, setNickname] = useState(initial.nickname);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (enabled && !nickname.trim()) { setError("Cần nhập Nick name trước khi bật"); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ nickname: nickname.trim(), enabled });
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
          <h3>Nick name khi chat</h3>
          <button className="chat-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="chat-modal-body">
          <label className="chat-member-row" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>Dùng Nick name thay cho họ tên thật khi chat</span>
          </label>
          <label className="flabel">Nick name</label>
          <input
            className="finput"
            style={{ width: "100%" }}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="VD: Sói Già, Cú Đêm..."
            maxLength={40}
          />
          <div style={{ fontSize: 11.5, color: "var(--text-400)", marginTop: 8 }}>
            Bật lên thì tin nhắn/cảm xúc bạn gửi sẽ hiện Nick name thay vì họ tên thật. Danh sách thành viên nhóm (admin quản lý) vẫn hiện họ tên thật.
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

  const [imageUrls, setImageUrls] = useState({}); // messageId -> blob URL (ảnh đã tải để xem trực tiếp)
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null); // preview ảnh TRƯỚC khi gửi
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [sendingSticker, setSendingSticker] = useState(false);

  const [groupMembers, setGroupMembers] = useState([]); // thành viên nhóm đang xem — dùng cho gợi ý @tag
  const [mentionQuery, setMentionQuery] = useState(null); // null = không đang gõ @tag
  const [mentionStart, setMentionStart] = useState(0); // vị trí ký tự "@" trong text
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);

  const [reactPickerFor, setReactPickerFor] = useState(null); // id tin nhắn đang mở bảng chọn cảm xúc
  const [replyTarget, setReplyTarget] = useState(null); // tin nhắn đang được trả lời (null = không reply)

  const [myNickname, setMyNickname] = useState({ nickname: "", enabled: false });
  const [showNicknameModal, setShowNicknameModal] = useState(false);

  const wsRef = useRef(null);
  const listEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const activeGroupIdRef = useRef(null);
  activeGroupIdRef.current = activeGroupId;
  const messageRefs = useRef({}); // messageId -> DOM node, để cuộn tới khi bấm vào khối trích dẫn reply

  function scrollToMessage(id) {
    const el = messageRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("chat-msg-highlight");
    setTimeout(() => el.classList.remove("chat-msg-highlight"), 1200);
  }

  function loadGroups() {
    listChatGroups().then((data) => {
      setGroups(data);
      setActiveGroupId((prev) => prev ?? (data.find((g) => g.is_default)?.id ?? data[0]?.id ?? null));
    }).catch((err) => setError(err.message));
  }

  useEffect(() => { loadGroups(); }, []);
  useEffect(() => { getMyChatNickname().then(setMyNickname).catch(() => {}); }, []);

  async function handleSaveNickname({ nickname, enabled }) {
    const updated = await updateMyChatNickname({ nickname, enabled });
    setMyNickname(updated);
  }

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

        if (payload.type === "reaction") {
          if (payload.group_id === activeGroupIdRef.current) {
            setMessages((prev) => prev.map((m) => (m.id === payload.message_id ? { ...m, reactions: payload.reactions } : m)));
          }
          return;
        }

        if (payload.type !== "message") return;
        if (payload.group_id === activeGroupIdRef.current) {
          setMessages((prev) => [...prev, payload.message]);
        }
        // Cập nhật preview + đưa nhóm có tin mới lên đầu danh sách
        setGroups((prev) => {
          const idx = prev.findIndex((g) => g.id === payload.group_id);
          if (idx === -1) return prev;
          const updated = { ...prev[idx], last_message_preview: friendlyPreview(payload.message.content) || (payload.message.file_name ? `📎 ${payload.message.file_name}` : "Tệp đính kèm"), last_message_at: payload.message.created_at };
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

  // ---------- Nạp lịch sử + danh sách thành viên (để gợi ý @tag) khi đổi nhóm ----------
  useEffect(() => {
    if (!activeGroupId) return;
    setMessages([]);
    setHasMore(false);
    setMentionQuery(null);
    setReplyTarget(null);
    listChatMessages(activeGroupId).then((rows) => {
      setMessages(rows);
      setHasMore(rows.length >= 50);
    }).catch((err) => setError(err.message));
    getChatGroupMembers(activeGroupId).then(setGroupMembers).catch(() => setGroupMembers([]));
  }, [activeGroupId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ---------- Tự tải ảnh (kèm token) cho các tin nhắn có file ảnh để hiện
  // trực tiếp trong khung chat, thay vì chỉ hiện link tải về ----------
  useEffect(() => {
    messages.forEach((m) => {
      if (m.has_file && isImageFile(m.file_name) && !imageUrls[m.id]) {
        fetchChatMessageImageUrl(m.id)
          .then((url) => setImageUrls((prev) => (prev[m.id] ? prev : { ...prev, [m.id]: url })))
          .catch(() => {});
      }
    });
  }, [messages]);

  // Giải phóng bộ nhớ blob URL khi rời trang
  useEffect(() => {
    return () => {
      Object.values(imageUrls).forEach((url) => URL.revokeObjectURL(url));
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOlder() {
    if (!messages.length) return;
    const rows = await listChatMessages(activeGroupId, messages[0].id);
    setMessages((prev) => [...rows, ...prev]);
    setHasMore(rows.length >= 50);
  }

  async function handleSendSticker(sticker) {
    setShowStickerPicker(false);
    setSendingSticker(true);
    try {
      await sendChatMessage(activeGroupId, { content: `[[sticker:${sticker.id}]]`, file: null });
    } catch (err) {
      setError(err.message || "Gửi sticker thất bại");
    } finally {
      setSendingSticker(false);
    }
  }

  async function handleSend() {
    if (!text.trim() && !file) return;
    setSending(true);
    setError("");
    try {
      await sendChatMessage(activeGroupId, { content: text, file, replyToId: replyTarget?.id });
      setText("");
      clearFileSelection();
      setReplyTarget(null);
    } catch (err) {
      setError(err.message || "Gửi tin nhắn thất bại");
    } finally {
      setSending(false);
    }
  }

  // ---------- Gõ "@" -> gợi ý tag tên thành viên nhóm (kiểu Messenger/Slack) ----------
  const mentionMatches = mentionQuery === null
    ? []
    : groupMembers.filter((m) => normName(m.full_name).includes(normName(mentionQuery))).slice(0, 8);

  useEffect(() => { setMentionActiveIndex(0); }, [mentionQuery]);

  function handleTextChange(e) {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    setText(val);

    const uptoCursor = val.slice(0, cursor);
    const atIdx = uptoCursor.lastIndexOf("@");
    if (atIdx === -1 || /\s/.test(uptoCursor.slice(atIdx + 1))) {
      setMentionQuery(null);
      return;
    }
    setMentionStart(atIdx);
    setMentionQuery(uptoCursor.slice(atIdx + 1));
  }

  function selectMention(member) {
    const before = text.slice(0, mentionStart);
    const after = text.slice(mentionStart + 1 + (mentionQuery?.length || 0));
    const inserted = `@${member.full_name} `;
    const next = before + inserted + after;
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e) {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionActiveIndex((i) => (i + 1) % mentionMatches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionActiveIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); selectMention(mentionMatches[mentionActiveIndex] || mentionMatches[0]); return; }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleReact(messageId, emoji) {
    setReactPickerFor(null);
    try {
      const { reactions } = await reactToChatMessage(messageId, emoji);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    } catch (err) {
      alert(err.message || "Thả cảm xúc thất bại");
    }
  }

  function handlePickFile(e) {
    const f = e.target.files?.[0] || null;
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFile(f);
    setFilePreviewUrl(f && isImageFile(f.name) ? URL.createObjectURL(f) : null);
  }

  function clearFileSelection() {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFile(null);
    setFilePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Chèn emoji vào đúng vị trí con trỏ trong khung nhập, không phải luôn
  // luôn nối vào cuối — trải nghiệm giống ứng dụng chat thật.
  function insertEmoji(emoji) {
    const ta = textareaRef.current;
    if (!ta) { setText((t) => t + emoji); return; }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.length;
      ta.setSelectionRange(pos, pos);
    });
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
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
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
        <button className="upload-btn" style={{ width: "auto" }} onClick={() => setShowNicknameModal(true)}>
          {myNickname.enabled ? `👤 ${myNickname.nickname}` : "👤 Đặt Nick name"}
        </button>
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
                  <div className="chat-group-preview">{friendlyPreview(g.last_message_preview) || "Chưa có tin nhắn"}</div>
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
                  const { counts: reactionCounts, names: reactionNames, mine: myReaction } = summarizeReactions(m.reactions, me?.id);
                  const hasReactions = Object.keys(reactionCounts).length > 0;
                  const stickerMatch = m.content ? m.content.match(STICKER_RE) : null;
                  const sticker = stickerMatch ? STICKER_MAP[stickerMatch[1]] : null;
                  return (
                    <div
                      key={m.id}
                      ref={(el) => { messageRefs.current[m.id] = el; }}
                      className={`chat-msg-row ${isMe ? "me" : ""}`}
                    >
                      {!isMe && <div className="chat-msg-sender">{m.sender_name}</div>}
                      <div className="chat-bubble-wrap">
                        {sticker ? (
                          <div className="chat-sticker-block">
                            {m.reply_to && (
                              <div className="chat-reply-quote" onClick={() => scrollToMessage(m.reply_to.id)}>
                                <div className="chat-reply-quote-sender">{m.reply_to.sender_name}</div>
                                <div className="chat-reply-quote-text">{friendlyPreview(m.reply_to.content) || "Tệp đính kèm"}</div>
                              </div>
                            )}
                            <div className={`chat-sticker anim-${sticker.anim}`} title={sticker.label}>{sticker.emoji}</div>
                            <div className="chat-sticker-label">{sticker.label} · {fmtTime(m.created_at)}</div>
                          </div>
                        ) : (
                          <div className={`chat-bubble ${isMe ? "me" : ""}`}>
                            {m.reply_to && (
                              <div className={`chat-reply-quote ${isMe ? "me" : ""}`} onClick={() => scrollToMessage(m.reply_to.id)}>
                                <div className="chat-reply-quote-sender">{m.reply_to.sender_name}</div>
                                <div className="chat-reply-quote-text">{friendlyPreview(m.reply_to.content) || "Tệp đính kèm"}</div>
                              </div>
                            )}
                            {m.content && <div className="chat-bubble-text">{renderMessageContent(m.content, groupMembers)}</div>}
                            {m.has_file && isImageFile(m.file_name) ? (
                              imageUrls[m.id] ? (
                                <img
                                  src={imageUrls[m.id]}
                                  alt={m.file_name || "Ảnh"}
                                  className="chat-image"
                                  onClick={() => setLightboxUrl(imageUrls[m.id])}
                                />
                              ) : (
                                <div className="chat-image-loading">Đang tải ảnh...</div>
                              )
                            ) : m.has_file ? (
                              <button className="chat-file-chip" onClick={() => downloadChatMessageFile(m.id, m.file_name)}>
                                📎 {m.file_name || "Tệp đính kèm"}
                              </button>
                            ) : null}
                            <div className="chat-bubble-time">{fmtTime(m.created_at)}</div>
                          </div>
                        )}

                        <div className="chat-msg-actions">
                          <button className="chat-react-trigger" title="Trả lời" onClick={() => setReplyTarget(m)}>↩</button>
                          <div className="chat-react-wrap">
                            <button className="chat-react-trigger" title="Thả cảm xúc" onClick={() => setReactPickerFor(reactPickerFor === m.id ? null : m.id)}>😊</button>
                            {reactPickerFor === m.id && (
                              <>
                                <div className="chat-emoji-backdrop" onClick={() => setReactPickerFor(null)} />
                                <div className={`chat-react-picker ${isMe ? "align-right" : ""}`}>
                                  {REACTION_EMOJIS.map((e) => (
                                    <button key={e} className="chat-react-emoji-btn" onClick={() => handleReact(m.id, e)}>{e}</button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {hasReactions && (
                        <div className={`chat-reactions-row ${isMe ? "me" : ""}`}>
                          {Object.entries(reactionCounts).map(([emoji, count]) => (
                            <div key={emoji} className="chat-reaction-pill-wrap">
                              <button
                                className={`chat-reaction-pill ${myReaction === emoji ? "mine" : ""}`}
                                onClick={() => handleReact(m.id, emoji)}
                              >
                                {emoji} {count}
                              </button>
                              <div className="chat-reaction-tooltip">{(reactionNames[emoji] || []).join(", ")}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={listEndRef} />
              </div>

              {replyTarget && (
                <div className="chat-reply-preview-bar">
                  <span className="chat-reply-preview-icon">↩</span>
                  <div className="chat-reply-preview-text">
                    <div className="chat-reply-preview-sender">Trả lời {replyTarget.sender_name}</div>
                    <div className="chat-reply-preview-content">{friendlyPreview(replyTarget.content) || (replyTarget.file_name ? `📎 ${replyTarget.file_name}` : "Tệp đính kèm")}</div>
                  </div>
                  <button className="chat-icon-btn" title="Hủy trả lời" onClick={() => setReplyTarget(null)}>✕</button>
                </div>
              )}

              {file && (
                <div className="chat-file-preview-bar">
                  {filePreviewUrl ? (
                    <img src={filePreviewUrl} alt={file.name} className="chat-file-preview-thumb" />
                  ) : (
                    <span className="chat-file-preview-icon">📎</span>
                  )}
                  <span className="chat-file-preview-name">{file.name}</span>
                  <button className="chat-icon-btn" title="Bỏ đính kèm" onClick={clearFileSelection}>✕</button>
                </div>
              )}

              <div className="chat-input-bar">
                <button className="chat-toolbar-btn" title="Đính kèm file/ảnh" onClick={() => fileInputRef.current?.click()}>📎</button>
                <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar" style={{ display: "none" }} onChange={handlePickFile} />

                <div className="chat-emoji-wrap">
                  <button className="chat-toolbar-btn" title="Gửi emoji" onClick={() => setShowEmojiPicker((v) => !v)}>😊</button>
                  {showEmojiPicker && (
                    <>
                      <div className="chat-emoji-backdrop" onClick={() => setShowEmojiPicker(false)} />
                      <div className="chat-emoji-picker">
                        {EMOJI_LIST.map((e) => (
                          <button key={e} className="chat-emoji-btn" onClick={() => insertEmoji(e)}>{e}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="chat-emoji-wrap">
                  <button className="chat-toolbar-btn" title="Gửi sticker meme" disabled={sendingSticker} onClick={() => setShowStickerPicker((v) => !v)}>🎭</button>
                  {showStickerPicker && (
                    <>
                      <div className="chat-emoji-backdrop" onClick={() => setShowStickerPicker(false)} />
                      <div className="chat-sticker-picker">
                        {STICKERS.map((s) => (
                          <button key={s.id} className="chat-sticker-picker-item" onClick={() => handleSendSticker(s)}>
                            <span className={`chat-sticker-preview anim-${s.anim}`}>{s.emoji}</span>
                            <span className="chat-sticker-picker-label">{s.label}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="chat-mention-wrap">
                  {mentionQuery !== null && mentionMatches.length > 0 && (
                    <div className="chat-mention-picker" onMouseDown={(e) => e.preventDefault()}>
                      {mentionMatches.map((m, i) => (
                        <button
                          key={m.id}
                          className={`chat-mention-item ${i === mentionActiveIndex ? "active" : ""}`}
                          onClick={() => selectMention(m)}
                        >
                          <span className="chat-mention-avatar">{((m.full_name || "?").trim().split(" ").pop() || "?")[0].toUpperCase()}</span>
                          {m.full_name}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={textareaRef}
                    className="chat-textarea"
                    rows={1}
                    placeholder="Nhập tin nhắn... (gõ @ để tag thành viên)"
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                  />
                </div>
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

      {showNicknameModal && (
        <NicknameModal
          initial={myNickname}
          onClose={() => setShowNicknameModal(false)}
          onSave={handleSaveNickname}
        />
      )}

      {lightboxUrl && (
        <div className="chat-lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Xem ảnh" className="chat-lightbox-img" />
          <button className="chat-lightbox-close" onClick={() => setLightboxUrl(null)}>✕</button>
        </div>
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

        @media (max-width: 860px) {
          .chat-shell { flex-direction: column; height: calc(100vh - 230px); min-height: 560px; }
          .chat-sidebar { width: 100%; max-height: 140px; flex-shrink: 0; }
          .chat-main { flex: 1; min-height: 320px; }
          .chat-msg-row { max-width: 88%; }
          .chat-image { max-width: 70vw; }
          /* Nút thả cảm xúc dựa vào :hover để hiện ra — cảm ứng không có
             hover nên trước đây gần như vô hình (opacity 0.35) và khó bấm
             trúng trên mobile. Hiện rõ sẵn + vùng chạm to hơn. */
          .chat-react-trigger { opacity: 0.6; padding: 8px 9px; }
          .chat-msg-actions { gap: 4px; }
        }
        .chat-main-head { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
        .chat-messages { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
        .chat-msg-row { display: flex; flex-direction: column; align-items: flex-start; max-width: 70%; }
        .chat-msg-row.me { align-self: flex-end; align-items: flex-end; }
        .chat-bubble-wrap { display: flex; align-items: flex-end; gap: 4px; }
        .chat-msg-row.me .chat-bubble-wrap { flex-direction: row-reverse; }
        .chat-msg-sender { font-size: 11.5px; color: var(--text-400); margin-bottom: 2px; margin-left: 4px; }
        .chat-bubble { background: var(--bg); border-radius: 14px; padding: 9px 13px; }
        .chat-bubble.me { background: var(--blue-accent); color: #fff; }
        .chat-bubble-text { font-size: 13.5px; white-space: pre-wrap; word-break: break-word; }
        .chat-mention { font-weight: 700; color: var(--blue-accent); background: rgba(85,128,214,0.12); border-radius: 4px; padding: 0 3px; }
        .chat-bubble.me .chat-mention { color: #fff; background: rgba(255,255,255,0.22); }
        .chat-bubble-time { font-size: 10px; opacity: 0.7; margin-top: 4px; text-align: right; }
        .chat-file-chip { display: block; margin-top: 6px; background: rgba(255,255,255,0.5); border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; padding: 6px 10px; font-size: 12.5px; cursor: pointer; text-align: left; }
        .chat-bubble.me .chat-file-chip { background: rgba(255,255,255,0.18); border-color: rgba(255,255,255,0.3); color: #fff; }
        .chat-image { display: block; max-width: 240px; max-height: 240px; border-radius: 10px; margin-top: 4px; cursor: pointer; object-fit: cover; }
        .chat-image-loading { font-size: 12px; color: var(--text-400); margin-top: 4px; }

        .chat-msg-actions { display: flex; align-items: center; gap: 2px; align-self: center; }
        .chat-react-wrap { position: relative; }
        .chat-react-trigger {
          background: none; border: none; cursor: pointer; font-size: 13px; padding: 4px 6px; border-radius: 50%;
          opacity: 0.35; transition: opacity 0.15s;
        }
        .chat-msg-row:hover .chat-react-trigger { opacity: 0.9; }
        .chat-react-trigger:hover { opacity: 1; background: var(--bg); }
        .chat-react-picker {
          position: absolute; bottom: 100%; margin-bottom: 6px; left: 0; z-index: 200;
          background: var(--card); border: 1px solid var(--border); border-radius: 20px;
          box-shadow: 0 12px 30px rgba(10,25,55,0.18); padding: 5px 6px;
          display: flex; gap: 2px; white-space: nowrap;
        }
        .chat-react-picker.align-right { left: auto; right: 0; }
        .chat-react-emoji-btn { background: none; border: none; font-size: 19px; padding: 4px 5px; border-radius: 50%; cursor: pointer; line-height: 1; }
        .chat-react-emoji-btn:hover { background: var(--bg); transform: scale(1.15); }

        .chat-reactions-row { display: flex; gap: 4px; margin-top: 3px; flex-wrap: wrap; }
        .chat-reactions-row.me { justify-content: flex-end; }
        .chat-reaction-pill {
          background: var(--card); border: 1.5px solid var(--border); border-radius: 12px;
          padding: 1px 7px; font-size: 11.5px; cursor: pointer; color: var(--text-600);
        }
        .chat-reaction-pill:hover { background: var(--bg); }
        .chat-reaction-pill.mine { border-color: var(--blue-accent); background: rgba(85,128,214,0.1); color: var(--blue-accent); font-weight: 700; }
        .chat-reaction-pill-wrap { position: relative; }
        .chat-reaction-tooltip {
          position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 5px;
          background: #1f2937; color: #fff; font-size: 11px; padding: 4px 9px; border-radius: 6px;
          white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.15s; z-index: 60;
        }
        .chat-reaction-pill-wrap:hover .chat-reaction-tooltip { opacity: 1; }

        .chat-reply-quote {
          border-left: 3px solid var(--blue-accent); background: rgba(0,0,0,0.04); border-radius: 6px;
          padding: 4px 8px; margin-bottom: 6px; cursor: pointer; max-width: 220px;
        }
        .chat-reply-quote.me { border-left-color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.15); }
        .chat-reply-quote-sender { font-size: 11px; font-weight: 700; color: var(--blue-accent); }
        .chat-reply-quote.me .chat-reply-quote-sender { color: #fff; }
        .chat-reply-quote-text { font-size: 12px; color: var(--text-600); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chat-reply-quote.me .chat-reply-quote-text { color: rgba(255,255,255,0.85); }

        .chat-reply-preview-bar { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-top: 1px solid var(--border); background: var(--bg); }
        .chat-reply-preview-icon { font-size: 16px; color: var(--blue-accent); }
        .chat-reply-preview-text { flex: 1; min-width: 0; }
        .chat-reply-preview-sender { font-size: 11.5px; font-weight: 700; color: var(--blue-accent); }
        .chat-reply-preview-content { font-size: 12px; color: var(--text-600); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        @keyframes chat-msg-flash { 0%,100% { background: transparent; } 30% { background: rgba(85,128,214,0.18); } }
        .chat-msg-highlight { animation: chat-msg-flash 1.2s ease; border-radius: 10px; }

        .chat-sticker-block { display: flex; flex-direction: column; align-items: center; padding: 4px 2px; }
        .chat-sticker { font-size: 56px; line-height: 1; }
        .chat-sticker-label { font-size: 10.5px; color: var(--text-400); margin-top: 2px; }

        @keyframes chat-anim-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes chat-anim-wiggle { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
        @keyframes chat-anim-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        @keyframes chat-anim-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.18); } }
        @keyframes chat-anim-tada { 0%,100% { transform: scale(1) rotate(0); } 20% { transform: scale(1.08) rotate(-4deg); } 40% { transform: scale(1.08) rotate(4deg); } 60% { transform: scale(1.12) rotate(-3deg); } 80% { transform: scale(1.12) rotate(3deg); } }
        .anim-bounce { display: inline-block; animation: chat-anim-bounce 0.9s ease-in-out infinite; }
        .anim-wiggle { display: inline-block; animation: chat-anim-wiggle 0.7s ease-in-out infinite; }
        .anim-shake { display: inline-block; animation: chat-anim-shake 0.5s ease-in-out infinite; }
        .anim-pulse { display: inline-block; animation: chat-anim-pulse 1s ease-in-out infinite; }
        .anim-tada { display: inline-block; animation: chat-anim-tada 1.4s ease-in-out infinite; }

        .chat-sticker-picker {
          position: absolute; bottom: 48px; left: 0; z-index: 200;
          background: var(--card); border: 1px solid var(--border); border-radius: 10px;
          box-shadow: 0 12px 30px rgba(10,25,55,0.18); padding: 8px;
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; width: 260px; max-height: 280px; overflow-y: auto;
        }
        .chat-sticker-picker-item {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          background: none; border: none; padding: 8px 4px; border-radius: 8px; cursor: pointer;
        }
        .chat-sticker-picker-item:hover { background: var(--bg); }
        .chat-sticker-preview { font-size: 28px; line-height: 1; }
        .chat-sticker-picker-label { font-size: 10px; color: var(--text-600); text-align: center; }

        .chat-input-bar { display: flex; align-items: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); }
        .chat-textarea { flex: 1; resize: none; border: 1.5px solid var(--border); border-radius: 10px; padding: 9px 12px; font-size: 13.5px; font-family: inherit; max-height: 100px; }

        .chat-toolbar-btn {
          width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          font-size: 21px; line-height: 1; background: var(--card); border: 1.5px solid var(--border); border-radius: 10px;
          cursor: pointer; transition: border-color 0.15s, background 0.15s, transform 0.1s;
        }
        .chat-toolbar-btn:hover { border-color: var(--blue-accent); background: var(--bg); }
        .chat-toolbar-btn:active { transform: scale(0.94); }
        .chat-toolbar-btn:disabled { opacity: 0.5; cursor: default; }

        .chat-file-preview-bar { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-top: 1px solid var(--border); background: var(--bg); }
        .chat-file-preview-thumb { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; }
        .chat-file-preview-icon { font-size: 20px; }
        .chat-file-preview-name { flex: 1; font-size: 12.5px; color: var(--text-600); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .chat-emoji-wrap { position: relative; }
        .chat-emoji-backdrop { position: fixed; inset: 0; z-index: 199; }
        .chat-emoji-picker {
          position: absolute; bottom: 48px; left: 0; z-index: 200;
          background: var(--card); border: 1px solid var(--border); border-radius: 10px;
          box-shadow: 0 12px 30px rgba(10,25,55,0.18); padding: 8px;
          display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px; width: 232px;
        }
        .chat-emoji-btn { background: none; border: none; font-size: 19px; padding: 5px; border-radius: 6px; cursor: pointer; line-height: 1; }
        .chat-emoji-btn:hover { background: var(--bg); }

        .chat-mention-wrap { position: relative; flex: 1; display: flex; }
        .chat-mention-picker {
          position: absolute; bottom: 100%; left: 0; margin-bottom: 6px; z-index: 200;
          background: var(--card); border: 1px solid var(--border); border-radius: 10px;
          box-shadow: 0 12px 30px rgba(10,25,55,0.18); padding: 6px; width: 240px; max-height: 220px; overflow-y: auto;
        }
        .chat-mention-item {
          display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
          background: none; border: none; padding: 7px 8px; border-radius: 7px; cursor: pointer; font-size: 13px; color: var(--text-900);
        }
        .chat-mention-item:hover, .chat-mention-item.active { background: var(--bg); }
        .chat-mention-avatar {
          width: 22px; height: 22px; border-radius: 50%; background: var(--navy-800); color: #fff;
          display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0;
        }

        .chat-lightbox-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.82); display: flex; align-items: center; justify-content: center; z-index: 300; padding: 30px; }
        .chat-lightbox-img { max-width: 90vw; max-height: 90vh; border-radius: 6px; }
        .chat-lightbox-close { position: absolute; top: 20px; right: 28px; background: rgba(255,255,255,0.15); border: none; color: #fff; font-size: 18px; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; }

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
