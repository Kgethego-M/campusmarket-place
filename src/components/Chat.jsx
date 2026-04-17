import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Chat.module.css";
import NavBar from "./NavBarTemp.jsx";
import { db, auth } from "../firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  where,
  getDoc,
} from "firebase/firestore";
import { uploadToCloudinary } from "../utils/cloudinaryUpload";

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name = "?", size = 40, online = false }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={styles.avatarWrap} style={{ width: size, height: size }}>
      <div
        className={styles.avatar}
        style={{ width: size, height: size, fontSize: size * 0.36 }}
      >
        {initials}
      </div>
      {online && <span className={styles.onlineDot} />}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Chat() {
  const navigate = useNavigate();
  const me = auth.currentUser;

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarTab, setSidebarTab] = useState("chats");
  const [showMediaPanel, setShowMediaPanel] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [userNames, setUserNames] = useState({});

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioChunksRef = useRef([]);

  const activeConv = conversations.find((c) => c.id === activeId);
  const mediaItems = messages.filter(
    (m) => m.type === "image" || m.type === "video"
  );

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function resolveUserName(uid) {
    if (!uid || userNames[uid]) return;
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const d = snap.data();
        setUserNames((prev) => ({
          ...prev,
          [uid]: d.displayName || d.name || d.email || uid,
        }));
      }
    } catch {}
  }

  useEffect(() => {
    if (!me) return;

    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", me.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const convs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      convs.forEach((c) => {
        const otherId = (c.participants || []).find((p) => p !== me.uid);
        if (otherId) resolveUserName(otherId);
      });
      setConversations(convs);
    });

    return () => unsub();
  }, [me?.uid]);

  useEffect(() => {
    if (!activeId) return;

    const q = query(
      collection(db, "chats", activeId, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => unsub();
  }, [activeId]);

  useEffect(() => {
    if (!activeId || !me) return;
    updateDoc(doc(db, "chats", activeId), {
      [`unread_${me.uid}`]: 0,
    }).catch(() => {});
  }, [activeId]);

  function getOtherUid(conv) {
    return (conv?.participants || []).find((p) => p !== me?.uid);
  }

  function getOtherName(conv) {
    const uid = getOtherUid(conv);
    return userNames[uid] || uid || "Unknown";
  }

  function getUnread(conv) {
    return conv?.[`unread_${me?.uid}`] || 0;
  }

  const filteredConvs = [...conversations]
    .filter((c) => {
      const name = getOtherName(c).toLowerCase();
      const title = (c.listingTitle || "").toLowerCase();
      const q = searchQuery.toLowerCase();
      return name.includes(q) || title.includes(q);
    })
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));

  function openConv(id) {
    setActiveId(id);
    setMessages([]);
    setShowMediaPanel(false);
  }

  function goBackToList() {
    setActiveId(null);
    setShowMediaPanel(false);
  }

  function sendText() {
    const content = inputText.trim();
    if (!content) return;
    sendMessageToFirebase("text", content);
    setInputText("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const resourceType = file.type.startsWith("video/") ? "video" : "image";
    setIsUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      await sendMessageToFirebase(resourceType, url);
    } catch (err) {
      console.error(err);
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  async function sendMessageToFirebase(type, content, extra = {}) {
    if (!activeId || !me) return;

    const otherUid = getOtherUid(activeConv);
    const currentOtherUnread = activeConv?.[`unread_${otherUid}`] || 0;

    await addDoc(collection(db, "chats", activeId, "messages"), {
      senderId: me.uid,
      type,
      content,
      timestamp: serverTimestamp(),
      ...extra,
    });

    await updateDoc(doc(db, "chats", activeId), {
      lastMessage: type === "text" ? content : "📎 Attachment",
      updatedAt: serverTimestamp(),
      ...(otherUid
        ? { [`unread_${otherUid}`]: currentOtherUnread + 1 }
        : {}),
    });
  }

  function formatDuration(secs = 0) {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  return (
    <>
      {/* ✅ NAVBAR ADDED */}
      <NavBar />

      <div className={styles.page}>
        {/* ════════ SIDEBAR ════════ */}
        <aside
          className={`${styles.sidebar} ${
            activeId ? styles.sidebarMobileHidden : ""
          }`}
        >
          <div className={styles.sidebarHeader}>
            <h2 className={styles.sidebarTitle}>Messages</h2>
          </div>

          <div className={styles.searchRow}>
            <i className="fa-solid fa-magnifying-glass" />
            <input
              className={styles.searchInput}
              placeholder="Search conversations…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className={styles.tabBar}>
            <button
              className={`${styles.tab} ${
                sidebarTab === "chats" ? styles.tabActive : ""
              }`}
              onClick={() => setSidebarTab("chats")}
            >
              <i className="fa-solid fa-message" /> Chats
            </button>
            <button
              className={`${styles.tab} ${
                sidebarTab === "media" ? styles.tabActive : ""
              }`}
              onClick={() => setSidebarTab("media")}
            >
              <i className="fa-solid fa-images" /> Media
            </button>
          </div>

          {sidebarTab === "chats" && (
            <ul className={styles.convList}>
              {filteredConvs.map((conv) => (
                <li
                  key={conv.id}
                  className={`${styles.convItem} ${
                    conv.id === activeId ? styles.convItemActive : ""
                  }`}
                  onClick={() => openConv(conv.id)}
                >
                  <Avatar name={getOtherName(conv)} size={46} />
                  <div className={styles.convInfo}>
                    <span className={styles.convName}>
                      {getOtherName(conv)}
                    </span>
                    <span className={styles.convSub}>
                      {conv.listingTitle || ""}
                    </span>
                    <span className={styles.convLast}>
                      {conv.lastMessage || ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* ════════ CHAT PANEL ════════ */}
        <main
          className={`${styles.chatPanel} ${
            !activeId ? styles.chatPanelMobileHidden : ""
          }`}
        >
          {!activeId && (
            <div className={styles.noChat}>
              <i className="fa-solid fa-comments" />
              <h3>Select a conversation</h3>
            </div>
          )}

          {activeId && activeConv && (
            <>
              <header className={styles.chatHeader}>
                <button
                  className={styles.chatBackBtn}
                  onClick={goBackToList}
                >
                  <i className="fa-solid fa-arrow-left" />
                </button>

                <button
                  className={styles.headerProfile}
                  onClick={() => navigate("/profile")}
                >
                  <Avatar name={getOtherName(activeConv)} size={40} />
                </button>
              </header>

              <div className={styles.body}>
                <div className={styles.messages}>
                  {messages.map((msg, i) => (
                    <div key={msg.id} className={styles.msgRow}>
                      <div className={styles.bubble}>
                        {msg.type === "text" && (
                          <p>{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}