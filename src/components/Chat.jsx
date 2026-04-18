import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  const [searchParams] = useSearchParams();
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

  // ── Auto-open conversation from ?open=chatId (set by Message Seller) ──────
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) {
      setActiveId(openId);
    }
  }, [searchParams]);

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
  }, [activeId, me]);

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

  // Don't render until we have the user
  if (!me) {
    return (
      <>
        <NavBar />
        <div className={styles.page}>
          <div className={styles.noChat}>
            <i className="fa-solid fa-comments" />
            <h3>Please log in to view messages</h3>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
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
                  {getUnread(conv) > 0 && (
                    <span className={styles.unreadBadge}>{getUnread(conv)}</span>
                  )}
                </li>
              ))}
              {filteredConvs.length === 0 && (
                <li className={styles.noConvs}>
                  <p>No conversations yet</p>
                  <p className={styles.noConvsSub}>
                    Message a seller to start a chat
                  </p>
                </li>
              )}
            </ul>
          )}

          {sidebarTab === "media" && (
            <div className={styles.mediaPanel}>
              {mediaItems.length === 0 ? (
                <div className={styles.noMedia}>
                  <i className="fa-solid fa-images" />
                  <p>No shared media yet</p>
                </div>
              ) : (
                <div className={styles.mediaGrid}>
                  {mediaItems.map((item) => (
                    <div key={item.id} className={styles.mediaItem}>
                      {item.type === "image" ? (
                        <img src={item.content} alt="Shared" />
                      ) : (
                        <video src={item.content} controls />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
              <p>Click on a chat from the sidebar to start messaging</p>
            </div>
          )}

          {activeId && activeConv && (
            <>
              <header className={styles.chatHeader}>
                <button className={styles.chatBackBtn} onClick={goBackToList}>
                  <i className="fa-solid fa-arrow-left" />
                </button>

                <button
                  className={styles.headerProfile}
                  onClick={() => {
                    const otherUid = getOtherUid(activeConv);
                    if (otherUid) navigate(`/profile/${otherUid}`);
                  }}
                >
                  <Avatar name={getOtherName(activeConv)} size={40} />
                  <span className={styles.headerName}>
                    {getOtherName(activeConv)}
                  </span>
                </button>
              </header>

              <div className={styles.body}>
                <div className={styles.messages}>
                  {messages.map((msg) => {
                    const isMe = msg.senderId === me?.uid;
                    return (
                      <div
                        key={msg.id}
                        className={`${styles.msgRow} ${
                          isMe ? styles.msgRowMe : styles.msgRowThem
                        }`}
                      >
                        <div
                          className={`${styles.bubble} ${
                            isMe ? styles.bubbleMe : styles.bubbleThem
                          }`}
                        >
                          {msg.type === "text" && (
                            <p style={{ margin: 0 }}>{msg.content}</p>
                          )}
                          {msg.type === "image" && (
                            <img
                              src={msg.content}
                              alt="attachment"
                              style={{
                                maxWidth: "200px",
                                borderRadius: "8px",
                                display: "block",
                              }}
                            />
                          )}
                          {msg.type === "video" && (
                            <video
                              src={msg.content}
                              controls
                              style={{
                                maxWidth: "200px",
                                borderRadius: "8px",
                                display: "block",
                              }}
                            />
                          )}
                          <span className={styles.msgTime}>
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* ── Input bar ── */}
              <div className={styles.inputBar}>
                <input
                  type="file"
                  accept="image/*,video/*"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  onChange={handleFileSelect}
                />
                <button
                  className={styles.attachBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <i className="fa-solid fa-paperclip" />
                </button>
                <input
                  className={styles.textInput}
                  placeholder={isUploading ? "Uploading…" : "Type a message…"}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isUploading}
                />
                <button
                  className={styles.sendBtn}
                  onClick={sendText}
                  disabled={!inputText.trim() || isUploading}
                >
                  <i className="fa-solid fa-paper-plane" />
                </button>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}