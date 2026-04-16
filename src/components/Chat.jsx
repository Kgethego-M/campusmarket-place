import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Chat.module.css";

// ── Placeholder data ──────────────────────────────────────────────────────────
const MOCK_CONVERSATIONS = [
  {
    id: "txn_001",
    otherUser: { name: "Lerato Dlamini", avatar: null },
    listingTitle: "Re: MacBook Pro 2021",
    lastMessage: "Is the price negotiable?",
    timestamp: "10:32",
    unread: 2,
    online: true,
  },
  {
    id: "txn_002",
    otherUser: { name: "Sipho Nkosi", avatar: null },
    listingTitle: "Re: Canon EOS Camera",
    lastMessage: "I can drop off tomorrow.",
    timestamp: "09:14",
    unread: 0,
    online: false,
  },
  {
    id: "txn_003",
    otherUser: { name: "Amahle Zulu", avatar: null },
    listingTitle: "Re: Calculus Textbook",
    lastMessage: "Does it include the solutions manual?",
    timestamp: "Yesterday",
    unread: 1,
    online: true,
  },
];

const MOCK_MESSAGES = {
  txn_001: [
    { id: "m1", senderId: "other", type: "text", content: "Hi, is this still available?", timestamp: "10:00" },
    { id: "m2", senderId: "me", type: "text", content: "Yes it is! Still in great condition.", timestamp: "10:01" },
    { id: "m3", senderId: "other", type: "text", content: "Is the price negotiable?", timestamp: "10:32" },
  ],
  txn_002: [
    { id: "m4", senderId: "me", type: "text", content: "Hey, I accepted your offer.", timestamp: "09:00" },
    { id: "m5", senderId: "other", type: "text", content: "I can drop off tomorrow.", timestamp: "09:14" },
  ],
  txn_003: [
    { id: "m6", senderId: "other", type: "text", content: "Does it include the solutions manual?", timestamp: "Yesterday" },
  ],
};

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 40, online = false }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={styles.avatarWrap} style={{ width: size, height: size }}>
      <div className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.36 }}>
        {initials}
      </div>
      {online && <span className={styles.onlineDot} />}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Chat() {
  const navigate = useNavigate();

  const [conversations] = useState(MOCK_CONVERSATIONS);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState(MOCK_MESSAGES);
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarTab, setSidebarTab] = useState("chats");
  const [showMediaPanel, setShowMediaPanel] = useState(false);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioChunksRef = useRef([]);

  const activeConv = conversations.find((c) => c.id === activeId);
  const activeMessages = messages[activeId] || [];
  const mediaImages = activeMessages.filter((m) => m.type === "image");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages]);

  const filteredConvs = conversations.filter(
    (c) =>
      c.otherUser.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.listingTitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function openConv(id) {
    setActiveId(id);
    setShowMediaPanel(false);
  }

  function goBackToList() {
    setActiveId(null);
    setShowMediaPanel(false);
  }

  function sendText() {
    const content = inputText.trim();
    if (!content) return;
    appendMessage({ type: "text", content });
    setInputText("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  }

  function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    appendMessage({ type: "image", content: url, fileName: file.name });
    e.target.value = "";
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        appendMessage({ type: "audio", content: url, duration: recordingSeconds });
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch {
      alert("Microphone access denied.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
  }

  function appendMessage(partial) {
    const msg = {
      id: `m_${Date.now()}`,
      senderId: "me",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      ...partial,
    };
    setMessages((prev) => ({
      ...prev,
      [activeId]: [...(prev[activeId] || []), msg],
    }));
  }

  function formatDuration(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  const allMedia = conversations.flatMap((c) =>
    (messages[c.id] || [])
      .filter((m) => m.type === "image")
      .map((m) => ({ ...m, convName: c.otherUser.name }))
  );

  return (
    <div className={styles.page}>

      {/* ════════ SIDEBAR ════════ */}
      <aside className={`${styles.sidebar} ${activeId ? styles.sidebarMobileHidden : ""}`}>

        <div className={styles.sidebarHeader}>
          <button className={styles.backBtn} onClick={() => navigate(-1)} title="Back">
            <i className="fa-solid fa-arrow-left" />
          </button>
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
          {searchQuery && (
            <button className={styles.searchClear} onClick={() => setSearchQuery("")}>
              <i className="fa-solid fa-xmark" />
            </button>
          )}
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

        {sidebarTab === "chats" && (
          <ul className={styles.convList}>
            {filteredConvs.length === 0 && (
              <li className={styles.emptyState}>
                <i className="fa-solid fa-comment-slash" />
                <span>No conversations found</span>
              </li>
            )}
            {filteredConvs.map((conv) => (
              <li
                key={conv.id}
                className={`${styles.convItem} ${conv.id === activeId ? styles.convItemActive : ""}`}
                onClick={() => openConv(conv.id)}
              >
                <Avatar name={conv.otherUser.name} size={46} online={conv.online} />
                <div className={styles.convInfo}>
                  <span className={styles.convName}>{conv.otherUser.name}</span>
                  <span className={styles.convSub}>{conv.listingTitle}</span>
                  <span className={styles.convLast}>{conv.lastMessage}</span>
                </div>
                <div className={styles.convMeta}>
                  <span className={styles.convTime}>{conv.timestamp}</span>
                  {conv.unread > 0 && <span className={styles.badge}>{conv.unread}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {sidebarTab === "media" && (
          <div className={styles.mediaGridWrap}>
            {allMedia.length === 0 ? (
              <div className={styles.emptyState}>
                <i className="fa-solid fa-photo-film" />
                <span>No media shared yet</span>
              </div>
            ) : (
              <div className={styles.mediaGrid}>
                {allMedia.map((m) => (
                  <div key={m.id} className={styles.mediaThumb}>
                    <img src={m.content} alt="shared" />
                    <span className={styles.mediaLabel}>{m.convName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ════════ CHAT PANEL ════════ */}
      <main className={`${styles.chatPanel} ${!activeId ? styles.chatPanelMobileHidden : ""}`}>

        {!activeId && (
          <div className={styles.noChat}>
            <i className="fa-solid fa-comments" />
            <h3>Select a conversation</h3>
            <p>Choose a chat from the list to start messaging</p>
          </div>
        )}

        {activeId && activeConv && (
          <>
            <header className={styles.chatHeader}>
              {/* Mobile back button */}
              <button className={styles.chatBackBtn} onClick={goBackToList} title="Back to chats">
                <i className="fa-solid fa-arrow-left" />
              </button>

              {/* Clickable profile area */}
              <button
                className={styles.headerProfile}
                onClick={() => navigate("/profile")}
                title="View profile"
              >
                <Avatar name={activeConv.otherUser.name} size={40} online={activeConv.online} />
                <div className={styles.headerInfo}>
                  <span className={styles.headerName}>{activeConv.otherUser.name}</span>
                  <span className={styles.headerStatus}>
                    {activeConv.online ? (
                      <>
                        <i className="fa-solid fa-circle" style={{ color: "#22c55e", fontSize: "0.45rem" }} />
                        {" "}Online
                      </>
                    ) : (
                      "Offline"
                    )}
                  </span>
                </div>
              </button>

              <div className={styles.headerActions}>
                <button
                  className={`${styles.headerBtn} ${showMediaPanel ? styles.headerBtnActive : ""}`}
                  title="Shared media"
                  onClick={() => setShowMediaPanel((v) => !v)}
                >
                  <i className="fa-solid fa-photo-film" />
                </button>
                <button className={styles.headerBtn} title="More options">
                  <i className="fa-solid fa-ellipsis-vertical" />
                </button>
              </div>
            </header>

            {/* Listing context tag */}
            <div className={styles.listingTag}>
              <i className="fa-solid fa-tag" />
              <span>{activeConv.listingTitle}</span>
            </div>

            {/* Body: messages + optional media side panel */}
            <div className={styles.body}>
              <div className={styles.messages}>
                {activeMessages.map((msg, i) => {
                  const isMe = msg.senderId === "me";
                  const showAvatar =
                    !isMe && (i === 0 || activeMessages[i - 1].senderId !== "other");
                  return (
                    <div
                      key={msg.id}
                      className={`${styles.msgRow} ${isMe ? styles.msgRowMe : styles.msgRowThem}`}
                    >
                      {!isMe && (
                        <div className={styles.msgAvatarSlot}>
                          {showAvatar
                            ? <Avatar name={activeConv.otherUser.name} size={28} />
                            : <div style={{ width: 28 }} />}
                        </div>
                      )}
                      <div className={`${styles.bubble} ${isMe ? styles.bubbleMe : styles.bubbleThem}`}>
                        {msg.type === "text" && (
                          <p className={styles.bubbleText}>{msg.content}</p>
                        )}
                        {msg.type === "image" && (
                          <img src={msg.content} alt="sent" className={styles.bubbleImg} />
                        )}
                        {msg.type === "audio" && (
                          <div className={styles.audioMsg}>
                            <i className="fa-solid fa-microphone" />
                            <audio controls src={msg.content} className={styles.audioPlayer} />
                            <span className={styles.audioDuration}>{formatDuration(msg.duration)}</span>
                          </div>
                        )}
                        <div className={styles.bubbleMeta}>
                          <span className={styles.bubbleTime}>{msg.timestamp}</span>
                          {isMe && (
                            <i
                              className="fa-solid fa-check-double"
                              style={{ fontSize: "0.6rem", color: "#60a5fa" }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Shared media side panel */}
              {showMediaPanel && (
                <aside className={styles.mediaPanel}>
                  <div className={styles.mediaPanelHeader}>
                    <span>Shared Media</span>
                    <button onClick={() => setShowMediaPanel(false)}>
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </div>
                  <div className={styles.mediaPanelGrid}>
                    {mediaImages.length === 0 ? (
                      <p className={styles.mediaPanelEmpty}>No images shared yet</p>
                    ) : (
                      mediaImages.map((m) => (
                        <img key={m.id} src={m.content} alt="shared" className={styles.mediaPanelImg} />
                      ))
                    )}
                  </div>
                </aside>
              )}
            </div>

            {/* Input bar */}
            <footer className={styles.inputBar}>
              {isRecording ? (
                <div className={styles.recordingBar}>
                  <span className={styles.recordingDot} />
                  <span className={styles.recordingLabel}>
                    Recording… {formatDuration(recordingSeconds)}
                  </span>
                  <button className={styles.stopBtn} onClick={stopRecording}>
                    <i className="fa-solid fa-stop" /> Send
                  </button>
                </div>
              ) : (
                <div className={styles.inputRow}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleImageSelect}
                  />
                  <button
                    className={styles.iconBtn}
                    title="Attach image"
                    onClick={() => fileInputRef.current.click()}
                  >
                    <i className="fa-solid fa-paperclip" />
                  </button>

                  <input
                    className={styles.textInput}
                    placeholder="Type a message…"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />

                  {inputText.trim() ? (
                    <button className={styles.sendBtn} onClick={sendText}>
                      <i className="fa-solid fa-paper-plane" />
                    </button>
                  ) : (
                    <button className={styles.iconBtn} title="Voice note" onClick={startRecording}>
                      <i className="fa-solid fa-microphone" />
                    </button>
                  )}
                </div>
              )}
            </footer>
          </>
        )}
      </main>
    </div>
  );
}