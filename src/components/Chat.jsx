//Chat.jsx
import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import styles from "./Chat.module.css";
import NavBar from "./NavBarTemp.jsx";
import { db, auth } from "../firebase";
import {
  collection, addDoc, query, orderBy, onSnapshot,
  doc, updateDoc, serverTimestamp, where, getDoc,
} from "firebase/firestore";
import { uploadToCloudinary } from "../utils/cloudinaryUpload";

// ── Avatar ───────────────────────────────────────────────────────
function Avatar({ name = "?", photoURL = null, size = 40, online = false }) {
  const initials = name
    .split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={styles.avatarWrap} style={{ width: size, height: size }}>
      {photoURL ? (
        <img
          src={photoURL}
          alt={name}
          className={styles.avatarImg}
          style={{ width: size, height: size }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      ) : (
        <div className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.36 }}>
          {initials}
        </div>
      )}
      {online && <span className={styles.onlineDot} />}
    </div>
  );
}

function formatTime(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Chat() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const me = auth.currentUser;

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId]           = useState(null);
  const [messages, setMessages]           = useState([]);
  const [inputText, setInputText]         = useState("");
  const [searchQuery, setSearchQuery]     = useState("");
  const [sidebarTab, setSidebarTab]       = useState("chats");
  const [isUploading, setIsUploading]     = useState(false);
  const [userProfiles, setUserProfiles]   = useState({});
  const [convsLoading, setConvsLoading]   = useState(true);

  const fileInputRef    = useRef(null);
  const messagesEndRef  = useRef(null);
  const resolvedUidsRef = useRef(new Set());

  const activeConv = conversations.find((c) => c.id === activeId);
  const mediaItems = messages.filter((m) => m.type === "image" || m.type === "video");

  // Auto-open from ?open= param
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) setActiveId(openId);
  }, [searchParams]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Resolve user profile
  async function resolveUserProfile(uid) {
    if (!uid || resolvedUidsRef.current.has(uid)) return;
    resolvedUidsRef.current.add(uid);
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const d = snap.data();
        const name =
          `${d.firstName || ""} ${d.lastName || ""}`.trim() ||
          d.displayName || d.name || d.email || uid;
        setUserProfiles((prev) => ({
          ...prev,
          [uid]: { name, photoURL: d.photoURL || null },
        }));
      }
    } catch {}
  }

  // Subscribe to conversations
  useEffect(() => {
    if (!me) return;
    const q = query(collection(db, "chats"), where("participants", "array-contains", me.uid));
    const unsub = onSnapshot(q, async (snap) => {
      const convs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      await Promise.all(
        convs.map((c) => {
          const otherId = (c.participants || []).find((p) => p !== me.uid);
          return otherId ? resolveUserProfile(otherId) : Promise.resolve();
        })
      );
      setConversations(convs);
      setConvsLoading(false);
    });
    return () => unsub();
  }, [me?.uid]);

  // Subscribe to messages
  useEffect(() => {
    if (!activeId) return;
    const q = query(collection(db, "chats", activeId, "messages"), orderBy("timestamp", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [activeId]);

  // Mark unread as 0 when opening a chat
  useEffect(() => {
    if (!activeId || !me) return;
    updateDoc(doc(db, "chats", activeId), { [`unread_${me.uid}`]: 0 }).catch(() => {});
  }, [activeId, me]);

  function getOtherUid(conv) {
    return (conv?.participants || []).find((p) => p !== me?.uid);
  }

  function getOtherProfile(conv) {
    const uid = getOtherUid(conv);
    return userProfiles[uid] || { name: uid || "Unknown", photoURL: null };
  }

  function getUnread(conv) {
    return conv?.[`unread_${me?.uid}`] || 0;
  }

  const filteredConvs = [...conversations]
    .filter((c) => {
      const profile = getOtherProfile(c);
      const q = searchQuery.toLowerCase();
      return (
        profile.name.toLowerCase().includes(q) ||
        (c.listingTitle || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));

  function openConv(id) {
    setActiveId(id);
    setMessages([]);
  }

  function goBackToList() {
    setActiveId(null);
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

  async function sendMessageToFirebase(type, content) {
    if (!activeId || !me) return;
    const otherUid           = getOtherUid(activeConv);
    const currentOtherUnread = activeConv?.[`unread_${otherUid}`] || 0;

    await addDoc(collection(db, "chats", activeId, "messages"), {
      senderId: me.uid, type, content, timestamp: serverTimestamp(),
    });

    await updateDoc(doc(db, "chats", activeId), {
      lastMessage: type === "text" ? content : "📎 Attachment",
      updatedAt:   serverTimestamp(),
      ...(otherUid ? { [`unread_${otherUid}`]: currentOtherUnread + 1 } : {}),
    });
  }

  if (!me) return (
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

  return (
    <>
      <NavBar />
      <div className={styles.page}>

        {/* ═══ SIDEBAR ═══ */}
        <aside className={`${styles.sidebar} ${activeId ? styles.sidebarMobileHidden : ""}`}>
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
              className={`${styles.tab} ${sidebarTab === "chats" ? styles.tabActive : ""}`}
              onClick={() => setSidebarTab("chats")}
            >
              <i className="fa-solid fa-message" /> Chats
            </button>
            <button
              className={`${styles.tab} ${sidebarTab === "media" ? styles.tabActive : ""}`}
              onClick={() => setSidebarTab("media")}
            >
              <i className="fa-solid fa-images" /> Media
            </button>
          </div>

          {/* ── Chats tab ── */}
          {sidebarTab === "chats" && (
            convsLoading ? (
              <ul className={styles.convList}>
                {[...Array(5)].map((_, i) => (
                  <li key={i} className={styles.skeletonItem} style={{ animationDelay: `${i * 80}ms` }}>
                    <div className={styles.skeletonAvatar} />
                    <div className={styles.skeletonInfo}>
                      <div className={styles.skeletonLine} style={{ width: "55%" }} />
                      <div className={styles.skeletonLine} style={{ width: "75%", height: 10 }} />
                      <div className={styles.skeletonLine} style={{ width: "40%", height: 9 }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className={styles.convList}>
                {filteredConvs.map((conv) => {
                  const profile = getOtherProfile(conv);
                  const unread  = getUnread(conv);
                  return (
                    <li
                      key={conv.id}
                      className={`${styles.convItem} ${conv.id === activeId ? styles.convItemActive : ""}`}
                      onClick={() => openConv(conv.id)}
                    >
                      <Avatar name={profile.name} photoURL={profile.photoURL} size={46} />
                      <div className={styles.convInfo}>
                        <span className={styles.convName}>{profile.name}</span>
                        {conv.listingTitle && (
                          <span className={styles.convSub}>{conv.listingTitle}</span>
                        )}
                        {conv.lastMessage && (
                          <span className={styles.convLast}>{conv.lastMessage}</span>
                        )}
                      </div>
                      {unread > 0 && (
                        <span className={styles.unreadBadge}>{unread}</span>
                      )}
                    </li>
                  );
                })}
                {filteredConvs.length === 0 && (
                  <li className={styles.noConvs}>
                    <div className={styles.noConvsInner}>
                      <i className="fa-solid fa-comments" />
                      <p>No conversations yet</p>
                      <p className={styles.noConvsSub}>Message a seller to start a chat</p>
                    </div>
                  </li>
                )}
              </ul>
            )
          )}

          {/* ── Media tab ── */}
          {sidebarTab === "media" && (
            <div className={styles.mediaSidePanel}>
              {mediaItems.length === 0 ? (
                <div className={styles.noMedia}>
                  <div className={styles.noMediaIcon}>
                    <i className="fa-solid fa-photo-film" />
                  </div>
                  <p className={styles.noMediaTitle}>No shared media</p>
                  <p className={styles.noMediaSub}>
                    Images and videos sent in this conversation will appear here
                  </p>
                </div>
              ) : (
                <div className={styles.mediaGrid}>
                  {mediaItems.map((item) => (
                    <div key={item.id} className={styles.mediaItem}>
                      {item.type === "image"
                        ? <img src={item.content} alt="Shared" />
                        : <video src={item.content} controls />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ═══ CHAT PANEL ═══ */}
        <main className={`${styles.chatPanel} ${!activeId ? styles.chatPanelMobileHidden : ""}`}>
          {!activeId && (
            <div className={styles.noChat}>
              <i className="fa-solid fa-comments" />
              <h3>Select a conversation</h3>
              <p>Click on a chat from the sidebar to start messaging</p>
            </div>
          )}

          {activeId && activeConv && (() => {
            const otherProfile = getOtherProfile(activeConv);
            return (
              <>
                {/* Header */}
                <header className={styles.chatHeader}>
                  <button className={styles.chatBackBtn} onClick={goBackToList}>
                    <i className="fa-solid fa-arrow-left" />
                  </button>
                  <button
                    className={styles.headerProfile}
                    onClick={() => {
                      const uid = getOtherUid(activeConv);
                      if (uid) navigate(`/profile/${uid}`);
                    }}
                  >
                    <Avatar name={otherProfile.name} photoURL={otherProfile.photoURL} size={38} />
                    <div className={styles.headerMeta}>
                      <span className={styles.headerName}>{otherProfile.name}</span>
                      {activeConv.listingTitle && (
                        <span className={styles.headerSub}>{activeConv.listingTitle}</span>
                      )}
                    </div>
                  </button>
                </header>

                {/* Messages */}
                <div className={styles.messagesWrap}>
                  <div className={styles.messages}>
                    {messages.map((msg) => {
                      const isMe = msg.senderId === me?.uid;
                      const time = formatTime(msg.timestamp);
                      return (
                        <div
                          key={msg.id}
                          className={`${styles.msgRow} ${isMe ? styles.msgRowMe : styles.msgRowThem}`}
                        >
                          {!isMe && (
                            <Avatar
                              name={otherProfile.name}
                              photoURL={otherProfile.photoURL}
                              size={28}
                            />
                          )}
                          <div className={`${styles.bubble} ${isMe ? styles.bubbleMe : styles.bubbleThem}`}>
                            {msg.type === "text" && (
                              <span className={styles.bubbleText}>{msg.content}</span>
                            )}
                            {msg.type === "image" && (
                              <img
                                src={msg.content}
                                alt="attachment"
                                className={styles.bubbleImg}
                              />
                            )}
                            {msg.type === "video" && (
                              <video
                                src={msg.content}
                                controls
                                className={styles.bubbleVideo}
                              />
                            )}
                            {time && (
                              <span className={styles.msgTime}>{time}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Input bar */}
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
                    title="Attach file"
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
                    title="Send"
                  >
                    <i className="fa-solid fa-paper-plane" />
                  </button>
                </div>
              </>
            );
          })()}
        </main>
      </div>
    </>
  );
}
