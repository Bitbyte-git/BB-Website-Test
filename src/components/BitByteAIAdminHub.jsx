import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./BitByteAIAdminHub.css";

export default function BitByteAIAdminHub({ token, onBackToApplications }) {
  // Knowledge Base State
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [feedMode, setFeedMode] = useState("file"); // 'file' | 'manual' | 'archive'
  const [statusMessage, setStatusMessage] = useState({ type: "", text: "" });

  // Manual Feed State
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState("Web & App Development");
  const [submittingManual, setSubmittingManual] = useState(false);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Archive Search State
  const [searchQuery, setSearchQuery] = useState("");

  // Success Modal State
  const [successModal, setSuccessModal] = useState({
    show: false,
    title: "",
    fileName: "",
    message: "",
    count: 0,
  });

  // Live AI Chat Simulator State
  const [chatMessages, setChatMessages] = useState([
    {
      id: "greeting",
      role: "bot",
      content:
        "Hello Admin! I am BitByte AI, loaded with our sub-2ms in-memory RAG engine. Test me with any question or query about our services, Salem office, tech stacks, or newly uploaded documents!",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatMessagesRef = useRef(null);
  const chatInputRef = useRef(null);

  const CATEGORIES = [
    "Web & App Development",
    "AI & Automation Solutions",
    "Business Analytics & Growth",
    "Careers & Internships",
    "Salem Office & Contact",
    "Pricing & Project Timelines",
  ];

  // Fetch ingested knowledge
  const fetchKnowledge = useCallback(async () => {
    setLoadingItems(true);
    try {
      const res = await fetch("/api/admin-knowledge", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setItems(data.items);
      }
    } catch {
      setStatusMessage({ type: "error", text: "Unable to load knowledge items from database." });
    } finally {
      setLoadingItems(false);
    }
  }, [token]);

  useEffect(() => {
    fetchKnowledge();
  }, [fetchKnowledge]);

  // Scroll only the internal chat box without moving the outer page window
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTo({
        top: chatMessagesRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [chatMessages, chatLoading]);

  // Handle Manual Q&A submit
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) {
      setStatusMessage({ type: "error", text: "Please enter both Question and Answer." });
      return;
    }

    setSubmittingManual(true);
    setStatusMessage({ type: "", text: "" });

    try {
      const res = await fetch("/api/admin-knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "add_qa",
          question: question.trim(),
          answer: answer.trim(),
          category,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({
          type: "success",
          text: "Knowledge item successfully learned and stored in MongoDB!",
        });
        setSuccessModal({
          show: true,
          title: "Q&A Learned Successfully!",
          fileName: "Manual Direct Feed",
          message: `Question: "${question.trim()}" is now permanently stored in MongoDB and live in AI memory!`,
          count: 1,
        });
        setQuestion("");
        setAnswer("");
        fetchKnowledge();
      } else {
        setStatusMessage({ type: "error", text: data.message || "Failed to feed knowledge." });
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: err.message || "Connection error." });
    } finally {
      setSubmittingManual(false);
    }
  };

  // Handle File Upload
  const handleFileUpload = async () => {
    if (!selectedFile) return;

    setUploadProgress(true);
    setStatusMessage({ type: "", text: "" });

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result.split(",")[1];
        try {
          const res = await fetch("/api/admin-knowledge", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: "upload_file",
              fileName: selectedFile.name,
              fileType: selectedFile.type,
              fileData: base64Data,
            }),
          });

          const data = await res.json();
          if (res.ok && data.success) {
            setStatusMessage({
              type: "success",
              text: `Success: ${data.message}`,
            });
            setSuccessModal({
              show: true,
              title: "File Ingested Successfully! 🚀",
              fileName: selectedFile.name,
              message: data.message || `Successfully ingested into BitByte AI!`,
              count: data.count || 1,
            });
            setSelectedFile(null);
            fetchKnowledge();
          } else {
            setStatusMessage({ type: "error", text: data.message || "File ingestion failed." });
          }
        } catch (err) {
          setStatusMessage({ type: "error", text: err.message || "Upload network error." });
        } finally {
          setUploadProgress(false);
        }
      };

      reader.readAsDataURL(selectedFile);
    } catch (err) {
      setStatusMessage({ type: "error", text: err.message || "Error reading file." });
      setUploadProgress(false);
    }
  };

  // Handle Delete Knowledge
  const handleDeleteItem = async (id, itemQuestion) => {
    if (!window.confirm(`Delete this knowledge entry?\n"${itemQuestion}"`)) return;

    try {
      const res = await fetch(`/api/admin-knowledge?id=${encodeURIComponent(id || itemQuestion)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({ type: "success", text: "Knowledge item deleted." });
        setItems((prev) => prev.filter((it) => it.id !== id && it.question !== itemQuestion));
      }
    } catch {
      setStatusMessage({ type: "error", text: "Delete request failed." });
    }
  };

  // Handle Sync Cache
  const handleSyncCache = async () => {
    try {
      setStatusMessage({ type: "", text: "" });
      const res = await fetch("/api/admin-knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "sync_cache" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({ type: "success", text: "BitByte AI sub-2ms engine synchronized!" });
        fetchKnowledge();
      }
    } catch {
      setStatusMessage({ type: "error", text: "Cache sync failed." });
    }
  };

  // Handle Live Chat Send
  const handleSendChat = async (e) => {
    e?.preventDefault();
    const query = inputMessage.trim();
    if (!query || chatLoading) return;

    const userMsg = {
      id: Date.now().toString(),
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setChatLoading(true);

    try {
      const history = chatMessages.slice(-6).map((m) => ({
        role: m.role === "bot" ? "assistant" : "user",
        content: m.content,
      }));

      const res = await fetch("/api/admin-knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "admin_chat",
          message: query,
          history,
        }),
      });

      const data = await res.json();
      if (res.ok && (data.reply || data.success)) {
        const botMsg = {
          id: (Date.now() + 1).toString(),
          role: "bot",
          content: data.reply || "No reply generated.",
          sources: Array.isArray(data.sources) ? data.sources : [],
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setChatMessages((prev) => [...prev, botMsg]);

        // If an action (feed or delete) occurred, refresh knowledge archive list
        if (data.isAction) {
          fetchKnowledge();
        }
      } else {
        const errMsg = {
          id: (Date.now() + 1).toString(),
          role: "bot",
          content: data.reply || data.error || data.message || "Unable to retrieve response from AI engine.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setChatMessages((prev) => [...prev, errMsg]);
      }
    } catch (err) {
      const errMsg = {
        id: (Date.now() + 1).toString(),
        role: "bot",
        content: `Error connecting to AI chat engine: ${err.message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages((prev) => [...prev, errMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const filteredArchive = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        (item.question && item.question.toLowerCase().includes(q)) ||
        (item.answer && item.answer.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))
    );
  }, [items, searchQuery]);

  return (
    <div className="bb-ai-studio-container">
      {/* Studio Header Bar */}
      <div className="bb-ai-topbar">
        <div className="bb-ai-topbar-left">
          <div className="bb-ai-brand-badge">
            <i className="fa-solid fa-microchip" aria-hidden="true" />
          </div>
          <div>
            <div className="bb-ai-chip-row">
              <span className="bb-ai-tag">BitByte AI Studio</span>
              <span className="bb-ai-pulse-tag">
                <span className="bb-ai-pulse-dot" /> Sub-2ms Weighted RAG
              </span>
              <span className="bb-ai-db-tag">
                <i className="fa-solid fa-database" aria-hidden="true" /> {items.length} Docs Synced
              </span>
            </div>
            <h1 className="bb-ai-topbar-title">AI Knowledge Center & Live Simulator</h1>
            <p className="bb-ai-topbar-desc">
              Ingest Excel sheets, documents, and train BitByte AI in real-time with instant chat simulation.
            </p>
          </div>
        </div>

        <div className="bb-ai-topbar-actions">
          <button
            type="button"
            className="career-outline-link bb-ai-sync-btn"
            onClick={handleSyncCache}
            title="Synchronize in-memory AI engine"
          >
            <i className="fa-solid fa-arrows-rotate" aria-hidden="true" />
            Sync AI Memory
          </button>
          <button
            type="button"
            className="career-outline-link"
            onClick={onBackToApplications}
            title="Return to Career Applications"
          >
            <i className="fa-solid fa-arrow-left" aria-hidden="true" />
            Applications
          </button>
        </div>
      </div>

      {/* Global Status Banner */}
      {statusMessage.text && (
        <div
          className={`form-status ${statusMessage.type === "success" ? "is-success" : "is-blocked"}`}
          style={{ margin: "0 0 20px 0" }}
          role="status"
        >
          <i
            className={`fa-solid ${
              statusMessage.type === "success" ? "fa-circle-check" : "fa-triangle-exclamation"
            }`}
            aria-hidden="true"
          />
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Studio Two-Column Grid */}
      <div className="bb-ai-split-grid">
        {/* LEFT COLUMN: KNOWLEDGE MANAGEMENT */}
        <section className="bb-ai-panel-card bb-ai-knowledge-col">
          {/* Section Nav Tabs */}
          <div className="bb-ai-subnav">
            <button
              type="button"
              className={`bb-ai-subnav-btn ${feedMode === "file" ? "is-active" : ""}`}
              onClick={() => setFeedMode("file")}
            >
              <i className="fa-solid fa-file-excel" aria-hidden="true" />
              File Ingestion
            </button>
            <button
              type="button"
              className={`bb-ai-subnav-btn ${feedMode === "manual" ? "is-active" : ""}`}
              onClick={() => setFeedMode("manual")}
            >
              <i className="fa-solid fa-pen-nib" aria-hidden="true" />
              Quick Q&A
            </button>
            <button
              type="button"
              className={`bb-ai-subnav-btn ${feedMode === "archive" ? "is-active" : ""}`}
              onClick={() => setFeedMode("archive")}
            >
              <i className="fa-solid fa-book-bookmark" aria-hidden="true" />
              Memory Archive ({items.length})
            </button>
          </div>

          {/* VIEW A: FILE INGESTION */}
          {feedMode === "file" && (
            <div className="bb-ai-subpanel">
              <div className="bb-ai-card-intro">
                <h2>
                  <i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" />
                  Word, Excel & Document Feeder
                </h2>
                <p>Upload Word (.docx, .doc), Excel (.xlsx, .xls), CSV, JSON, or text documents to bulk train the AI.</p>
              </div>

              <div
                className={`bb-ai-drop-zone ${dragOver ? "is-dragover" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files?.[0]) setSelectedFile(e.dataTransfer.files[0]);
                }}
              >
                <div className="bb-ai-drop-icon-wrap">
                  <i className="fa-solid fa-file-word" aria-hidden="true" />
                </div>
                <p className="bb-ai-drop-lead">
                  {selectedFile ? selectedFile.name : "Drag & drop PDF (.pdf), Word (.docx), Excel or Document here"}
                </p>
                <span className="bb-ai-drop-formats">
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB — Ready to feed`
                    : "Supports PDF (.pdf), Word (.docx, .doc), Excel (.xlsx, .csv), .json, .txt, .md"}
                </span>

                <label className="career-outline-link bb-ai-choose-btn">
                  <i className="fa-solid fa-folder-open" aria-hidden="true" />
                  Choose File
                  <input
                    type="file"
                    accept=".pdf,.xlsx,.xls,.csv,.json,.txt,.md,.docx,.doc"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setSelectedFile(e.target.files[0]);
                        setStatusMessage({ type: "", text: "" });
                      }
                    }}
                    style={{ display: "none" }}
                  />
                </label>
              </div>

              {selectedFile && (
                <div className="bb-ai-feed-action-wrap">
                  <button
                    type="button"
                    className="btn-submit whatsapp-submit bb-ai-feed-btn"
                    onClick={handleFileUpload}
                    disabled={uploadProgress}
                  >
                    <span className="btn-submit-state">
                      {uploadProgress ? (
                        <>
                          <span className="signal-loader" aria-hidden="true" />
                          <span>Parsing & Feeding {selectedFile.name}...</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-bolt-lightning" aria-hidden="true" />
                          <span>Feed {selectedFile.name} to AI Engine</span>
                        </>
                      )}
                    </span>
                  </button>
                </div>
              )}

              <div className="bb-ai-tips-card">
                <h4>
                  <i className="fa-solid fa-lightbulb" aria-hidden="true" />
                  Smart Parsing Tip:
                </h4>
                <p>
                  Excel/CSV files should have <strong>Question</strong> and <strong>Answer</strong> columns, or
                  column A as the query and column B as the response. They are indexed into MongoDB instantly!
                </p>
              </div>
            </div>
          )}

          {/* VIEW B: MANUAL QUICK Q&A */}
          {feedMode === "manual" && (
            <div className="bb-ai-subpanel">
              <div className="bb-ai-card-intro">
                <h2>
                  <i className="fa-solid fa-feather" aria-hidden="true" />
                  Direct Knowledge Injection
                </h2>
                <p>Teach BitByte AI specific business questions, pricing policies, or services.</p>
              </div>

              <form onSubmit={handleManualSubmit} className="bb-ai-modern-form">
                <div className="bb-ai-form-group">
                  <label htmlFor="bbAiCategory">Domain / Category</label>
                  <select
                    id="bbAiCategory"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="bb-ai-input-select"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bb-ai-form-group">
                  <label htmlFor="bbAiQuestion">User Query / Question</label>
                  <input
                    id="bbAiQuestion"
                    type="text"
                    placeholder="e.g. Do you build Flutter mobile applications?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="bb-ai-input-text"
                    required
                  />
                </div>

                <div className="bb-ai-form-group">
                  <label htmlFor="bbAiAnswer">Official Answer / Response</label>
                  <textarea
                    id="bbAiAnswer"
                    rows={4}
                    placeholder="Provide the verified, accurate response that BitByte AI should deliver..."
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    className="bb-ai-textarea"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-submit whatsapp-submit bb-ai-feed-btn"
                  disabled={submittingManual}
                >
                  <span className="btn-submit-state">
                    {submittingManual ? (
                      <>
                        <span className="signal-loader" aria-hidden="true" />
                        <span>Injecting Knowledge...</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-sparkles" aria-hidden="true" />
                        <span>Inject into BitByte AI</span>
                      </>
                    )}
                  </span>
                </button>
              </form>
            </div>
          )}

          {/* VIEW C: ARCHIVE EXPLORER */}
          {feedMode === "archive" && (
            <div className="bb-ai-subpanel bb-ai-archive-wrap">
              <div className="bb-ai-search-box">
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Filter ingested knowledge..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery("")} className="bb-ai-clear-btn">
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="bb-ai-archive-scroll">
                {loadingItems ? (
                  <div className="bb-ai-empty-state">
                    <span className="signal-loader" aria-hidden="true" />
                    <p>Fetching MongoDB knowledge store...</p>
                  </div>
                ) : filteredArchive.length === 0 ? (
                  <div className="bb-ai-empty-state">
                    <i className="fa-solid fa-inbox" aria-hidden="true" />
                    <p>No knowledge records found.</p>
                  </div>
                ) : (
                  <div className="bb-ai-archive-list">
                    {filteredArchive.map((item, idx) => (
                      <article className="bb-ai-archive-item" key={item.id || item.question || idx}>
                        <div className="bb-ai-archive-head">
                          <span className="bb-ai-archive-badge">{item.category || "Verified"}</span>
                          <button
                            type="button"
                            className="bb-ai-del-icon-btn"
                            onClick={() => handleDeleteItem(item.id, item.question)}
                            title="Delete this knowledge item"
                          >
                            <i className="fa-solid fa-trash-can" aria-hidden="true" />
                          </button>
                        </div>
                        <h4 className="bb-ai-archive-q">{item.question}</h4>
                        <p className="bb-ai-archive-a">{item.answer}</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: LIVE AI CHAT SIMULATOR */}
        <section className="bb-ai-panel-card bb-ai-chat-col">
          {/* Chat Simulator Header */}
          <div className="bb-ai-sim-head">
            <div className="bb-ai-sim-title-wrap">
              <div className="bb-ai-bot-avatar">
                <i className="fa-solid fa-robot" aria-hidden="true" />
              </div>
              <div>
                <div className="bb-ai-sim-title">
                  <span>BitByte AI Simulator</span>
                  <span className="bb-ai-live-badge">ONLINE</span>
                </div>
                <span className="bb-ai-sim-sub">Testing live responses with active knowledge base</span>
              </div>
            </div>

            <button
              type="button"
              className="bb-ai-sim-clear-btn"
              onClick={() =>
                setChatMessages([
                  {
                    id: Date.now().toString(),
                    role: "bot",
                    content: "Chat cleared! Ask any question to test newly added knowledge.",
                    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  },
                ])
              }
              title="Reset Chat Session"
            >
              <i className="fa-solid fa-trash" aria-hidden="true" />
              Reset
            </button>
          </div>

          {/* Quick Prompt Suggestions */}
          <div className="bb-ai-prompts-bar">
            <span className="bb-ai-prompts-label">Quick Test:</span>
            <button
              type="button"
              className="bb-ai-prompt-pill"
              onClick={() => setInputMessage("What services does BitByte Technologies offer?")}
            >
              Services
            </button>
            <button
              type="button"
              className="bb-ai-prompt-pill"
              onClick={() => setInputMessage("Salem office address and contact details?")}
            >
              Contact & Office
            </button>
            <button
              type="button"
              className="bb-ai-prompt-pill"
              onClick={() => setInputMessage("Do you develop Flutter and React Native apps?")}
            >
              Mobile Apps
            </button>
            <button
              type="button"
              className="bb-ai-prompt-pill"
              onClick={() => setInputMessage("What are your current career openings?")}
            >
              Careers
            </button>
          </div>

          {/* Chat Messages Scroll Window */}
          <div className="bb-ai-chat-messages" ref={chatMessagesRef}>
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`bb-ai-msg-row ${msg.role === "user" ? "is-user" : "is-bot"}`}
              >
                {msg.role === "bot" && (
                  <div className="bb-ai-msg-avatar">
                    <i className="fa-solid fa-robot" aria-hidden="true" />
                  </div>
                )}
                <div className="bb-ai-msg-bubble">
                  <div className="bb-ai-msg-meta">
                    <span className="bb-ai-sender-name">{msg.role === "user" ? "You (Admin)" : "BitByte AI"}</span>
                    <span className="bb-ai-msg-time">{msg.timestamp}</span>
                  </div>
                  <div className="bb-ai-msg-text">{msg.content}</div>

                  {/* Sources tag if available */}
                  {Array.isArray(msg.sources) && msg.sources.length > 0 && (
                    <div className="bb-ai-sources-bar">
                      <span className="bb-ai-source-label">
                        <i className="fa-solid fa-link" aria-hidden="true" /> Retrieved Sources:
                      </span>
                      {msg.sources.map((s, idx) => (
                        <span className="bb-ai-source-tag" key={idx} title={s.url || ""}>
                          {s.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="bb-ai-msg-row is-bot">
                <div className="bb-ai-msg-avatar">
                  <i className="fa-solid fa-robot" aria-hidden="true" />
                </div>
                <div className="bb-ai-msg-bubble bb-ai-typing">
                  <span className="signal-loader" aria-hidden="true" />
                  <span>BitByte AI is searching verified knowledge & generating reply...</span>
                </div>
              </div>
            )}
          </div>

          {/* Chat Simulator Input Box */}
          <form onSubmit={handleSendChat} className="bb-ai-chat-input-bar">
            <input
              ref={chatInputRef}
              type="text"
              placeholder="Ask anything to test BitByte AI (e.g. in English or Tanglish)..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={chatLoading}
              className="bb-ai-sim-input"
            />
            <button
              type="submit"
              disabled={chatLoading || !inputMessage.trim()}
              className="bb-ai-sim-send-btn"
              title="Send to BitByte AI"
            >
              <i className="fa-solid fa-paper-plane" aria-hidden="true" />
            </button>
          </form>
        </section>
      </div>

      {/* SUCCESS POPUP MODAL */}
      {successModal.show && (
        <div
          className="bb-ai-modal-overlay"
          onClick={() => setSuccessModal((prev) => ({ ...prev, show: false }))}
        >
          <div className="bb-ai-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="bb-ai-modal-badge">
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
            </div>

            <div className="bb-ai-modal-chip">
              <span className="bb-ai-pulse-dot" /> Live Memory Synced
            </div>

            <h2 className="bb-ai-modal-title">{successModal.title}</h2>

            <p className="bb-ai-modal-msg">{successModal.message}</p>

            <div className="bb-ai-modal-details">
              <div className="bb-ai-modal-detail-item">
                <span className="detail-label">Source Document</span>
                <span className="detail-value">
                  <i className="fa-solid fa-file-excel" aria-hidden="true" /> {successModal.fileName}
                </span>
              </div>
              <div className="bb-ai-modal-detail-item">
                <span className="detail-label">Ingested Items</span>
                <span className="detail-value highlight-cyan">
                  <i className="fa-solid fa-layer-group" aria-hidden="true" /> {successModal.count} Records
                </span>
              </div>
              <div className="bb-ai-modal-detail-item">
                <span className="detail-label">Engine Status</span>
                <span className="detail-value highlight-green">
                  <i className="fa-solid fa-database" aria-hidden="true" /> MongoDB + Sub-2ms RAM
                </span>
              </div>
            </div>

            <div className="bb-ai-modal-actions">
              <button
                type="button"
                className="btn-submit whatsapp-submit bb-ai-modal-test-btn"
                onClick={() => {
                  setSuccessModal((prev) => ({ ...prev, show: false }));
                  setTimeout(() => chatInputRef.current?.focus(), 150);
                }}
              >
                <span className="btn-submit-state">
                  <i className="fa-solid fa-robot" aria-hidden="true" />
                  <span>Test in AI Simulator Now</span>
                </span>
              </button>
              <button
                type="button"
                className="career-outline-link bb-ai-modal-close-btn"
                onClick={() => setSuccessModal((prev) => ({ ...prev, show: false }))}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
