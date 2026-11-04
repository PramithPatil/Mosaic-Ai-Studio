"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AudioLines, BarChart3, BookOpen, Check, ChevronDown, CircleHelp, Clock3, FileAudio, Image as ImageIcon, LayoutDashboard, LockKeyhole, Menu, MessageSquareText, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, Shield, ShieldCheck, Video, WandSparkles, X, ArrowUpRight } from "lucide-react";

type Tool = "Text" | "Image" | "Audio" | "Video";
type AudioAction = "transcribe" | "speak";
type ImageQuality = "fast" | "balanced" | "quality";
type DialogState = { kind: "settings" | "help" | "safety" | "model" } | { kind: "activity" | "renameActivity" | "deleteActivity"; item: ActivityItem } | null;
type ActivityRange = "all" | "7" | "30";
type AuthState = { authenticated: boolean; configured: boolean; guardConfigured?: boolean; email?: string; workspaceId?: string };
type PromptItem = { id: string; title: string; content: string; version: number; updatedAt: string };
type ActivityItem = { id: string; title: string; modality: string; model: string; status: "complete"; costUsd: number | null; latencyMs: number; createdAt: string };
type MediaResult = { url: string; mimeType: string; label: string; latencyMs: number | null };

const tools: { name: Tool; icon: typeof MessageSquareText; detail: string; model: string; placeholder: string; button: string }[] = [
  { name: "Text", icon: MessageSquareText, detail: "Write, reason, and refine", model: "Ollama · Qwen 2.5 3B", placeholder: "Describe what you would like to create…", button: "Generate text" },
  { name: "Image", icon: ImageIcon, detail: "Generate and safety-check visuals", model: "ComfyUI · Stable Diffusion 1.5", placeholder: "A sunlit reading nook with trailing plants, warm film grain…", button: "Generate image" },
  { name: "Audio", icon: AudioLines, detail: "Transcribe audio or create speech", model: "Whisper · XTTS v2", placeholder: "Write the words you want spoken…", button: "Create speech" },
  { name: "Video", icon: Video, detail: "Create a scene from a prompt", model: "ComfyUI video workflow", placeholder: "Describe a short scene, camera movement, and mood…", button: "Generate video" },
];
const serviceInfo = [
  { name: "Text and safety gateway", address: "LiteLLM · localhost:4000" },
  { name: "Image generation", address: "ComfyUI · localhost:8188" },
  { name: "Audio transcription", address: "Speaches · localhost:8000" },
  { name: "Speech generation", address: "XTTS · localhost:8002" },
];

function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export default function Home() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileName, setProfileName] = useState("");
  const [active, setActive] = useState<Tool>("Text");
  const [activeSection, setActiveSection] = useState<"overview" | "studio">("overview");
  const [imageQuality, setImageQuality] = useState<ImageQuality>("quality");
  const [prompt, setPrompt] = useState("");
  const [generatedText, setGeneratedText] = useState("");
  const [generatedLabel, setGeneratedLabel] = useState("GENERATED OUTPUT");
  const [mediaResult, setMediaResult] = useState<MediaResult | null>(null);
  const [audioAction, setAudioAction] = useState<AudioAction>("transcribe");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string | undefined>();
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activityRange, setActivityRange] = useState<ActivityRange>("all");
  const [activityMenuId, setActivityMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const totalSpend = activity.reduce((sum, item) => sum + (item.costUsd ?? 0), 0);
  const spendKnown = activity.length > 0 && activity.every((item) => item.costUsd !== null);
  const averageLatency = activity.length ? Math.round(activity.reduce((sum, item) => sum + item.latencyMs, 0) / activity.length) : null;
  const userName = auth?.email?.split("@")[0] ?? "Workspace member";
  const visibleProfileName = profileName || userName;
  const initials = visibleProfileName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ME";
  const workspaceInitial = auth?.workspaceId?.slice(0, 1).toUpperCase() ?? "W";
  const selected = tools.find((tool) => tool.name === active)!;
  const filteredActivity = activity.filter((item) => {
    if (activityRange === "all") return true;
    const cutoff = Date.now() - Number(activityRange) * 24 * 60 * 60 * 1000;
    return new Date(item.createdAt).getTime() >= cutoff;
  });
  const filteredPrompts = prompts.filter((item) => `${item.title} ${item.content}`.toLowerCase().includes(libraryFilter.toLowerCase()));

  const refreshWorkspace = async () => {
    const [promptResponse, activityResponse] = await Promise.all([fetch("/api/prompts"), fetch("/api/activity")]);
    if (promptResponse.ok) setPrompts((await promptResponse.json()).prompts);
    if (activityResponse.ok) setActivity((await activityResponse.json()).activity);
  };
  useEffect(() => {
    fetch("/api/auth/session").then((response) => response.json()).then(async (data: AuthState) => {
      setAuth(data);
      if (data.authenticated) {
        const defaultName = data.email?.split("@")[0] ?? "Workspace member";
        setProfileName(window.localStorage.getItem("mosaic-profile-name") || defaultName);
        await refreshWorkspace();
      }
    }).catch(() => setAuth({ authenticated: false, configured: false })).finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowSearch(true);
        setWorkspaceMenuOpen(false);
        setProfileMenuOpen(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        newGeneration();
      }
      if (event.key === "Escape") {
        setDialog(null); setShowSearch(false); setShowLibrary(false); setWorkspaceMenuOpen(false); setProfileMenuOpen(false); setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, []);
  useEffect(() => { if (showSearch) searchInputRef.current?.focus(); }, [showSearch]);

  const selectTool = (tool: Tool) => {
    setActive(tool); setActiveSection("studio"); setNotice(""); setGeneratedText(""); setGeneratedLabel("GENERATED OUTPUT"); setMediaResult(null); setAudioFile(null); setMobileNavOpen(false);
    document.getElementById("studio")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const newGeneration = () => {
    setPrompt(""); setSelectedPromptId(undefined); setSaveMessage(""); setNotice(""); setGeneratedText(""); setMediaResult(null); setAudioFile(null); selectTool("Text");
  };
  const goOverview = () => {
    setActiveSection("overview"); setMobileNavOpen(false);
    document.getElementById("overview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuth((current) => current ? { ...current, authenticated: false } : current);
    setProfileMenuOpen(false);
  };
  const saveCurrentPrompt = async () => {
    const content = prompt.trim();
    if (!content) { setSaveMessage("Write a prompt before saving it."); return; }
    setSavingPrompt(true); setSaveMessage("");
    try {
      const firstWords = content.split(/\s+/).slice(0, 5).join(" ").replace(/[.,!?;:]+$/, "");
      const title = firstWords.length > 34 ? `${firstWords.slice(0, 31)}…` : firstWords;
      const response = await fetch("/api/prompts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(selectedPromptId ? { id: selectedPromptId } : {}), title: title || "Untitled prompt", content }) });
      const data = await response.json();
      if (!response.ok) { setSaveMessage(data.error ?? "Could not save this prompt."); return; }
      setSelectedPromptId(data.prompt.id);
      await refreshWorkspace();
      setSaveMessage(`Saved as version ${data.prompt.version}.`);
    } catch { setSaveMessage("Could not reach prompt storage."); }
    finally { setSavingPrompt(false); }
  };
  const renameActivityEntry = async (item: ActivityItem, title: string): Promise<string | null> => {
    try {
      const response = await fetch("/api/activity", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, title }) });
      const data = await response.json();
      if (!response.ok) return data.error ?? "Could not rename this activity.";
      setActivity((current) => current.map((entry) => entry.id === item.id ? { ...entry, title } : entry));
      setDialog(null);
      return null;
    } catch { return "Could not reach activity storage."; }
  };
  const deleteActivityEntry = async (item: ActivityItem): Promise<string | null> => {
    try {
      const response = await fetch(`/api/activity?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) return data.error ?? "Could not delete this activity.";
      setActivity((current) => current.filter((entry) => entry.id !== item.id));
      setDialog(null);
      return null;
    } catch { return "Could not reach activity storage."; }
  };
  const generate = async () => {
    const transcribing = active === "Audio" && audioAction === "transcribe";
    if (transcribing && !audioFile) { setNotice("Choose an audio file to transcribe first."); return; }
    if (!transcribing && !prompt.trim()) { setNotice("Add a prompt first, then your request will be checked before generation."); return; }
    setGenerating(true); setNotice(transcribing ? "Transcribing and checking the transcript…" : "Checking your request…"); setGeneratedText(""); setMediaResult(null);
    try {
      let response: Response;
      if (transcribing) {
        const form = new FormData(); form.set("file", audioFile!);
        response = await fetch("/api/media/transcribe", { method: "POST", body: form });
      } else if (active === "Audio") {
        response = await fetch("/api/media/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: prompt }) });
      } else if (active === "Image" || active === "Video") {
        response = await fetch("/api/media/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modality: active.toLowerCase(), prompt, ...(active === "Image" ? { imageQuality } : {}) }) });
      } else {
        response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modality: "text", prompt }) });
      }
      const data = await response.json();
      if (response.status === 401) { setAuth((current) => current ? { ...current, authenticated: false } : current); return; }
      if (!response.ok) { setNotice(data.error ?? (response.status === 503 && active === "Text" ? "Configure LiteLLM and the safety model in .env.local to generate text." : "Generation could not be completed.")); return; }
      if (data.text) { setGeneratedText(data.text); setGeneratedLabel(transcribing ? "TRANSCRIPT" : "GENERATED OUTPUT"); }
      if (data.url && data.mimeType) setMediaResult({ url: data.url, mimeType: data.mimeType, latencyMs: typeof data.latencyMs === "number" ? data.latencyMs : null, label: transcribing ? "TRANSCRIPT · SAFETY CHECK PASSED" : "GENERATED MEDIA · SAFETY CHECKS PASSED" });
      const elapsed = typeof data.latencyMs === "number" ? `Completed in ${formatDuration(data.latencyMs)}` : "Completed";
      setNotice(`Safety checks passed · ${elapsed} · Cost tracking appears when the provider reports cost data.`);
      await refreshWorkspace();
    } catch { setNotice("Could not reach the studio API. Check that the app server is running."); }
    finally { setGenerating(false); }
  };

  const chooseSearchItem = (kind: "tool" | "prompt" | "activity", value: Tool | PromptItem | ActivityItem) => {
    setShowSearch(false); setSearchQuery("");
    if (kind === "tool") selectTool(value as Tool);
    if (kind === "prompt") {
      const item = value as PromptItem; setPrompt(item.content); setSelectedPromptId(item.id); selectTool("Text");
    }
    if (kind === "activity") setDialog({ kind: "activity", item: value as ActivityItem });
  };

  if (authLoading) return <div className="auth-loading"><span className="loader-line"/><span>Opening your workspace</span></div>;
  if (!auth?.authenticated) return <LoginScreen configured={Boolean(auth?.configured)} onLogin={(nextAuth) => { setAuth(nextAuth); setProfileName(window.localStorage.getItem("mosaic-profile-name") || nextAuth.email?.split("@")[0] || "Workspace member"); void refreshWorkspace(); }} />;

  const matchingTools = tools.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.detail.toLowerCase().includes(searchQuery.toLowerCase()));
  const matchingPrompts = prompts.filter((item) => `${item.title} ${item.content}`.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 4);
  const matchingActivity = activity.filter((item) => `${item.title} ${item.modality}`.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 4);

  return <main className={`app-shell ${collapsed ? "is-collapsed" : ""} ${mobileNavOpen ? "mobile-nav-open" : ""}`}>
    <aside className="sidebar">
      <div className="brand-row">
        <button className="brand-lockup" onClick={goOverview} aria-label="Mosaic Studio overview"><span className="brand-kicker">LOCAL WORKSPACE</span><span className="brand-name">MOSAIC</span></button>
        <button className="icon-button sidebar-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand navigation" : "Collapse navigation"}>{collapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button>
      </div>
      <div className="workspace-wrap">
        <button className="workspace-switcher" onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)} aria-label="Open workspace menu" aria-expanded={workspaceMenuOpen} title="Workspace menu"><span className="workspace-monogram">{workspaceInitial}</span><span className="workspace-copy"><b>{auth.workspaceId ?? "Workspace"}</b><small>Private workspace</small></span><ChevronDown size={15}/></button>
        {workspaceMenuOpen && <div className="anchored-menu workspace-menu"><div className="menu-eyebrow">SIGNED IN</div><b>{auth.email}</b><span>{auth.workspaceId ?? "Workspace"}</span><button onClick={() => { setDialog({ kind: "settings" }); setWorkspaceMenuOpen(false); }}><Settings2 size={14}/> Workspace settings</button></div>}
      </div>
      <button className="new-project" onClick={newGeneration} title="Start a new generation" aria-label="Start a new generation"><Plus size={16}/><span>New generation</span><kbd>Ctrl ⇧ N</kbd></button>
      <div className="nav-label">WORKSPACE</div>
      <nav className="primary-nav" aria-label="Workspace navigation">
        <button onClick={goOverview} title="Overview" aria-label="Overview" className={`nav-link ${activeSection === "overview" ? "selected" : ""}`}><LayoutDashboard size={17}/><span>Overview</span></button>
        {tools.map(({ name, icon: Icon }) => <button key={name} title={`${name} studio`} aria-label={`${name} studio`} onClick={() => selectTool(name)} className={`nav-link ${activeSection === "studio" && name === active ? "selected" : ""}`}><Icon size={17}/><span>{name} studio</span></button>)}
      </nav>
      <button title="Prompt library" aria-label={`Prompt library, ${prompts.length} saved`} className={`nav-link library-link ${showLibrary ? "selected" : ""}`} onClick={() => { setShowLibrary(true); setLibraryFilter(""); }}><BookOpen size={17}/><span>Prompt library</span><span className="nav-count">{prompts.length}</span></button>
      <div className="sidebar-spacer"/>
      <div className="nav-label">GOVERNANCE</div>
      <button className="nav-link" title="Safety center" aria-label="Safety center" onClick={() => setDialog({ kind: "safety" })}><ShieldCheck size={17}/><span>Safety center</span><span className="status-pip"/></button>
      <button className="nav-link" title="Settings" aria-label="Settings" onClick={() => setDialog({ kind: "settings" })}><Settings2 size={17}/><span>Settings</span></button>
      <div className="sidebar-bottom">
        <div className="usage-card"><div className="usage-heading"><span>Workspace activity</span><button className="tiny-info" onClick={() => setDialog({ kind: "help" })} aria-label="About workspace activity"><CircleHelp size={14}/></button></div><div className="usage-amount">{activity.length}<span> saved generations</span></div><div className="usage-caption">{spendKnown ? `Tracked model costs: $${totalSpend.toFixed(2)}` : "Local providers do not report cost"}</div></div>
        <div className="profile-wrap">
          <button className="profile-button" onClick={() => setProfileMenuOpen(!profileMenuOpen)} aria-label="Open profile menu" aria-expanded={profileMenuOpen} title="Profile menu"><span className="profile-avatar">{initials}</span><span className="profile-copy"><b>{visibleProfileName}</b><small>{auth.email}</small></span><MoreHorizontal size={17}/></button>
          {profileMenuOpen && <div className="anchored-menu profile-menu"><button onClick={() => { setDialog({ kind: "settings" }); setProfileMenuOpen(false); }}><Settings2 size={14}/> Profile and settings</button><button onClick={() => void signOut()}><LockKeyhole size={14}/> Sign out</button></div>}
        </div>
      </div>
    </aside>

    {mobileNavOpen && <button className="mobile-nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}/>}
    <section className="main-area">
      <header className="topbar">
        <div className="topbar-leading"><button className="icon-button mobile-menu-button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={19}/></button><div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-divider">/</span><b>{activeSection === "overview" ? "Overview" : `${active} studio`}</b></div></div>
        <div className="top-actions"><span className="environment"><i/> Local workspace</span><button className="search-button" onClick={() => setShowSearch(true)} aria-label="Search workspace (Ctrl K)" title="Search workspace"><Search size={15}/><span>Search</span><kbd>Ctrl K</kbd></button><button className="icon-button top-icon-button" aria-label="Help and shortcuts" title="Help" onClick={() => setDialog({ kind: "help" })}><CircleHelp size={17}/></button><button className="top-avatar" onClick={() => setDialog({ kind: "settings" })} aria-label="Open profile settings" title="Profile settings">{initials}</button></div>
      </header>

      <div className="content">
        <section className="overview-section" id="overview">
          <div className="overview-heading"><div><div className="eyebrow"><span className="live-indicator"/> PRIVATE CREATIVE WORKSPACE</div><h1>Your studio, at a glance.</h1><p>Generate, review, and manage work across your local models.</p></div><button className="primary-button" onClick={newGeneration}><Plus size={16}/> New generation</button></div>
          <div className="metrics-grid">
            <Metric label="Generations" value={String(activity.length)} change="Saved" icon={<BarChart3 size={17}/>} note="In this workspace"/>
            <Metric label="Tracked spend" value={spendKnown ? `$${totalSpend.toFixed(2)}` : "—"} change={spendKnown ? "Reported" : "Local"} icon={<LockKeyhole size={17}/>} note={spendKnown ? "Reported by provider" : "No provider cost data"}/>
            <Metric label="Average latency" value={averageLatency === null ? "—" : `${(averageLatency / 1000).toFixed(1)}s`} change={activity.length ? "Tracked" : "Pending"} icon={<Clock3 size={17}/>} note="Across saved generations"/>
            <Metric label="Safety checks" value={activity.length ? "Active" : "Ready"} change={auth.guardConfigured ? "Configured" : "Setup needed"} icon={<ShieldCheck size={17}/>} note="Requests checked before display"/>
          </div>
        </section>

        <section className="studio-section" id="studio">
          <div className="section-heading"><div><div className="eyebrow">CREATE</div><h2>Make something new</h2><p>Choose a modality, shape the prompt, and generate.</p></div><button className="quiet-button" onClick={() => { setShowLibrary(true); setLibraryFilter(""); }}><BookOpen size={15}/> Prompt library</button></div>
          <section className="studio-card">
            <div className="tool-tabs" role="tablist" aria-label="Generation type">{tools.map(({ name, icon: Icon }) => <button key={name} role="tab" aria-selected={active === name} className={`tool-tab ${active === name ? "active" : ""}`} onClick={() => selectTool(name)}><Icon size={16}/><span>{name}</span></button>)}</div>
            <div className="studio-body">
              <div className="model-row"><button className="model-picker" onClick={() => setDialog({ kind: "model" })} title="View model information"><span className="model-indicator"/><span>{selected.model}</span><ChevronDown size={14}/></button><span className="model-meta">{selected.detail}</span><button className="icon-button model-settings" aria-label="Model and service settings" title="Model and service settings" onClick={() => setDialog({ kind: "settings" })}><Settings2 size={16}/></button></div>
              {active === "Image" && <div className="image-quality-row"><label htmlFor="image-quality">Render</label><select id="image-quality" value={imageQuality} onChange={(event) => setImageQuality(event.target.value as ImageQuality)}><option value="quality">Higher detail · 512×512 · 12 steps</option><option value="balanced">Balanced · 384×384 · 8 steps</option><option value="fast">Fast preview · 320×320 · 4 steps</option></select><span>{imageQuality === "quality" ? "Higher detail takes longer on CPU." : imageQuality === "balanced" ? "Balanced detail and CPU time." : "Quick preview with fewer fine details."}</span></div>}
              {active === "Audio" && <div className="audio-mode-switch" role="group" aria-label="Audio task"><button className={audioAction === "transcribe" ? "chosen" : ""} onClick={() => { setAudioAction("transcribe"); setNotice(""); setGeneratedText(""); setMediaResult(null); }}>Transcribe audio</button><button className={audioAction === "speak" ? "chosen" : ""} onClick={() => { setAudioAction("speak"); setNotice(""); setGeneratedText(""); setMediaResult(null); }}>Create speech</button></div>}
              {active === "Audio" && audioAction === "transcribe" ? <div className="upload-field"><label className="prompt-label" htmlFor="audio-upload">AUDIO FILE <span>MAX 25 MB</span></label><input id="audio-upload" type="file" accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg" onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}/>{audioFile && <span className="upload-filename">{audioFile.name} · {(audioFile.size / (1024 * 1024)).toFixed(1)} MB</span>}</div> : <><label className="prompt-label" htmlFor="prompt">{active === "Audio" ? "TEXT TO SPEAK" : active === "Image" ? "DESCRIBE YOUR IMAGE" : active === "Video" ? "DESCRIBE YOUR VIDEO" : "YOUR PROMPT"}</label><textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={selected.placeholder}/></>}
              <div className="editor-footer"><div className="editor-hints"><span><LockKeyhole size={13}/> Private to your workspace</span><span className="hint-divider">/</span><span>{active === "Audio" && audioAction === "transcribe" ? audioFile ? "File ready" : "Choose a file" : `${prompt.length} / 4,000`}</span></div><div className="editor-actions">{active === "Text" && <button className="save-prompt-button" onClick={saveCurrentPrompt} disabled={savingPrompt}><BookOpen size={14}/>{savingPrompt ? "Saving…" : "Save prompt"}</button>}<button className="generate-button" onClick={generate} disabled={generating}><span>{generating ? "Working…" : active === "Audio" ? audioAction === "transcribe" ? "Transcribe audio" : "Create speech" : selected.button}</span>{generating ? <span className="button-spinner"/> : <ArrowUpRight size={15}/>}</button></div></div>
              {saveMessage && <div className="save-message" role="status">{saveMessage}<button onClick={() => setSaveMessage("")} aria-label="Dismiss message"><X size={13}/></button></div>}
              {notice && <div className="notice" role="status"><ShieldCheck size={15}/><span>{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14}/></button></div>}
              {generatedText && <section className="generated-output"><div className="output-label"><span>{generatedLabel}</span><span className="output-safety"><ShieldCheck size={13}/> Safety checks passed</span></div><p>{generatedText}</p></section>}
              {mediaResult && <section className="media-result"><div className="output-label"><span>{mediaResult.label}</span><a href={mediaResult.url} download>Download <ArrowUpRight size={12}/></a></div>{mediaResult.mimeType.startsWith("image/") ? <><img src={mediaResult.url} alt="AI-generated visual"/>{mediaResult.latencyMs !== null && <div className="media-details"><span><Clock3 size={12}/> Completed in {formatDuration(mediaResult.latencyMs)} · includes safety checks</span></div>}</> : mediaResult.mimeType.startsWith("video/") ? <video src={mediaResult.url} controls/> : <audio src={mediaResult.url} controls/>}</section>}
              <div className="safety-strip"><span className="safety-icon"><Shield size={16}/></span><span className="safety-copy"><b>Mosaic Guard</b><small>{auth.guardConfigured ? "Prompt and output checks are active" : "Configure the LiteLLM guard model to enable checks"}</small></span><button className="safety-link" onClick={() => setDialog({ kind: "safety" })}>How checks work <ArrowUpRight size={13}/></button></div>
            </div>
          </section>
        </section>

        <section className="lower-grid"><section className="activity-card"><div className="section-heading compact"><div><div className="eyebrow">HISTORY</div><h2>Recent activity</h2><p>Completed generations in this workspace.</p></div><label className="range-picker"><span className="sr-only">Filter activity date range</span><select value={activityRange} onChange={(event) => setActivityRange(event.target.value as ActivityRange)}><option value="all">All activity</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label></div><div className="activity-table"><div className="table-head"><span>GENERATION</span><span>MODEL</span><span>STATUS</span><span>COST</span><span/></div>{filteredActivity.slice(0, 6).map((entry) => <Activity key={entry.id} entry={entry} menuOpen={activityMenuId === entry.id} onToggleMenu={() => setActivityMenuId((current) => current === entry.id ? null : entry.id)} onInspect={() => { setActivityMenuId(null); setDialog({ kind: "activity", item: entry }); }} onRename={() => { setActivityMenuId(null); setDialog({ kind: "renameActivity", item: entry }); }} onDelete={() => { setActivityMenuId(null); setDialog({ kind: "deleteActivity", item: entry }); }}/>)}{filteredActivity.length === 0 && <div className="empty-activity">{activity.length ? "No generations in this date range." : "No generations recorded yet. Completed requests will appear here."}</div>}</div></section>
          <section className="governance-card"><div className="section-heading compact"><div><div className="eyebrow">GOVERNANCE</div><h2>Workspace records</h2><p>Data saved locally for this workspace.</p></div><ShieldCheck size={18}/></div><div className="governance-list"><div><span className="check-circle"><Check size={11}/></span><span>Signed-in account</span><b>Active</b></div><div><span className="check-circle"><Check size={11}/></span><span>Versioned prompts</span><b>{prompts.length} saved</b></div><div><span className="check-circle"><Check size={11}/></span><span>Generation history</span><b>{activity.length} saved</b></div></div><button className="policy-link" onClick={() => setDialog({ kind: "safety" })}>Read governance policy <ArrowUpRight size={13}/></button></section></section>
        <footer className="footer"><span>© 2026 Mosaic AI Studio</span><span><i className="footer-status"/>Signed in as {auth.email}</span><button onClick={() => setDialog({ kind: "safety" })}>Privacy and safety <ArrowUpRight size={12}/></button></footer>
      </div>
    </section>

    {showLibrary && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLibrary(false); }}><section className="modal-panel library-panel" role="dialog" aria-modal="true" aria-labelledby="library-title"><div className="modal-header"><div><div className="eyebrow">WORKSPACE</div><h2 id="library-title">Prompt library</h2><p>Reuse and refine saved prompts.</p></div><button className="icon-button modal-close" onClick={() => setShowLibrary(false)} aria-label="Close prompt library"><X size={18}/></button></div><label className="dialog-search"><Search size={16}/><input value={libraryFilter} onChange={(event) => setLibraryFilter(event.target.value)} placeholder="Filter saved prompts" autoFocus/></label><div className="prompt-list">{filteredPrompts.map((item) => <button className="prompt-item" key={item.id} onClick={() => { setPrompt(item.content); setSelectedPromptId(item.id); setShowLibrary(false); selectTool("Text"); }}><span className="prompt-item-title">{item.title}<small>Version {item.version} · Updated {new Date(item.updatedAt).toLocaleDateString()}</small></span><ArrowUpRight size={15}/><p>{item.content}</p></button>)}{filteredPrompts.length === 0 && <p className="empty-dialog">{prompts.length ? "No prompts match that search." : "No saved prompts yet. Save one from the Text studio."}</p>}</div><div className="modal-footer"><span>{prompts.length} saved prompts</span><button className="secondary-button" onClick={() => { setPrompt(""); setSelectedPromptId(undefined); setShowLibrary(false); selectTool("Text"); }}>Create a prompt</button></div></section></div>}

    {showSearch && <div className="modal-backdrop search-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSearch(false); }}><section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search workspace"><label className="dialog-search search-input"><Search size={18}/><input ref={searchInputRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search tools, prompts, and activity"/><kbd>ESC</kbd></label><div className="search-results">{matchingTools.map((item) => <button key={item.name} onClick={() => chooseSearchItem("tool", item.name)}><item.icon size={16}/><span>{item.name} studio<small>{item.detail}</small></span><ArrowUpRight size={14}/></button>)}{matchingPrompts.map((item) => <button key={item.id} onClick={() => chooseSearchItem("prompt", item)}><BookOpen size={16}/><span>{item.title}<small>Saved prompt · version {item.version}</small></span><ArrowUpRight size={14}/></button>)}{matchingActivity.map((item) => <button key={item.id} onClick={() => chooseSearchItem("activity", item)}><Clock3 size={16}/><span>{item.title}<small>Recent {item.modality} generation</small></span><ArrowUpRight size={14}/></button>)}{!matchingTools.length && !matchingPrompts.length && !matchingActivity.length && <p className="empty-dialog">No matching tools, prompts, or activity.</p>}</div><div className="search-footer"><span>Search your local workspace</span><span>Esc to close</span></div></section></div>}

    {dialog && <Dialog key={`${dialog.kind}-${"item" in dialog ? dialog.item.id : ""}`} state={dialog} auth={auth} active={active} imageQuality={imageQuality} profileName={visibleProfileName} activityCount={activity.length} onSaveProfileName={(name) => { const value = name.trim(); if (!value) return; window.localStorage.setItem("mosaic-profile-name", value); setProfileName(value); }} onRenameActivity={renameActivityEntry} onDeleteActivity={deleteActivityEntry} onClose={() => setDialog(null)} onSignOut={() => void signOut()}/>}
  </main>;
}

function Dialog({ state, auth, active, imageQuality, profileName, activityCount, onSaveProfileName, onRenameActivity, onDeleteActivity, onClose, onSignOut }: { state: Exclude<DialogState, null>; auth: AuthState; active: Tool; imageQuality: ImageQuality; profileName: string; activityCount: number; onSaveProfileName: (name: string) => void; onRenameActivity: (item: ActivityItem, title: string) => Promise<string | null>; onDeleteActivity: (item: ActivityItem) => Promise<string | null>; onClose: () => void; onSignOut: () => void }) {
  const [draftName, setDraftName] = useState(profileName);
  const [profileSaved, setProfileSaved] = useState(false);
  const [activityTitle, setActivityTitle] = useState(state.kind === "renameActivity" ? state.item.title : "");
  const [activityError, setActivityError] = useState("");
  const [activityBusy, setActivityBusy] = useState(false);
  const title = state.kind === "settings" ? "Profile and settings" : state.kind === "help" ? "Studio guide" : state.kind === "safety" ? "Safety and governance" : state.kind === "model" ? "Model details" : state.kind === "renameActivity" ? "Rename activity" : state.kind === "deleteActivity" ? "Delete activity" : "Generation details";
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-panel info-panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="modal-header"><div><div className="eyebrow">MOSAIC STUDIO</div><h2 id="dialog-title">{title}</h2></div><button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><X size={18}/></button></div>
    {state.kind === "settings" && <><div className="settings-profile"><span className="profile-avatar large-avatar">{draftName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ME"}</span><div><b>{draftName || "Workspace member"}</b><small>{auth.workspaceId ?? "Workspace"} · Private local account</small></div></div><form className="profile-settings-form" onSubmit={(event) => { event.preventDefault(); const value = draftName.trim(); if (!value) return; onSaveProfileName(value); setDraftName(value); setProfileSaved(true); }}><label htmlFor="profile-display-name">DISPLAY NAME</label><div><input id="profile-display-name" maxLength={48} value={draftName} onChange={(event) => { setDraftName(event.target.value); setProfileSaved(false); }} placeholder="Your name" required/><button className="secondary-button" type="submit" disabled={!draftName.trim()}>Save name</button></div><small>{profileSaved ? "Name saved on this device." : `Sign-in email: ${auth.email}`}</small></form><div className="dialog-section"><div className="eyebrow">CONNECTED SERVICES</div>{serviceInfo.map((service) => <div className="service-row" key={service.name}><span>{service.name}</span><small>{service.address}</small></div>)}</div><p className="dialog-note">Display name is saved in this browser. Sign-in email and provider credentials are managed in the project’s server-side <code>.env.local</code> file.</p><div className="modal-footer"><span>{activityCount} saved generations</span><button className="secondary-button" onClick={onSignOut}>Sign out</button></div></>}
    {state.kind === "help" && <><p className="dialog-lead">Use the studio tabs to create, review, and save work. The local services must be running before each modality is available.</p><div className="help-list">{tools.map((tool) => <div key={tool.name}><tool.icon size={17}/><span><b>{tool.name}</b><small>{tool.name === "Text" ? "Generate through LiteLLM and Ollama." : tool.name === "Image" ? "Generate with ComfyUI; choose a speed and detail preset." : tool.name === "Audio" ? "Switch between transcription and speech creation." : "Requires a configured ComfyUI video workflow."}</small></span></div>)}</div><div className="shortcut-note"><kbd>Ctrl</kbd><span>+</span><kbd>K</kbd><small>Open workspace search</small></div></>}
    {state.kind === "safety" && <><p className="dialog-lead">Mosaic checks prompts and generated content before displaying results. Local model checks can make mistakes; review outputs before sharing.</p><div className="help-list safety-list"><div><ShieldCheck size={17}/><span><b>Text and audio</b><small>Prompts, generated text, and transcripts are checked by the configured text guard.</small></span></div><div><ImageIcon size={17}/><span><b>Images</b><small>The image guard blocks unmistakable severe content. Ambiguous images can pass, so review each result.</small></span></div><div><LockKeyhole size={17}/><span><b>Data handling</b><small>Local media and workspace records stay in the project’s ignored .data folder.</small></span></div></div><div className="dialog-note">Report concerns to your workspace administrator. See <code>docs/governance-policy.md</code> in the project.</div></>}
    {state.kind === "model" && <><p className="dialog-lead">Current studio: <b>{active}</b></p><div className="dialog-section"><div className="eyebrow">ACTIVE MODEL</div><div className="service-row"><span>{tools.find((tool) => tool.name === active)?.model}</span><small>Local provider</small></div>{active === "Image" && <div className="service-row"><span>Image preset</span><small>{imageQuality === "quality" ? "Higher detail · 512×512 · 12 steps" : imageQuality === "balanced" ? "Balanced · 384×384 · 8 steps" : "Fast preview · 320×320 · 4 steps"}</small></div>}</div><p className="dialog-note">Change provider credentials and service URLs in the server-side environment file, then restart the app.</p></>}
    {state.kind === "activity" && <><p className="dialog-lead">{state.item.title}</p><div className="dialog-section"><div className="service-row"><span>Type</span><small>{state.item.modality}</small></div><div className="service-row"><span>Model</span><small>{state.item.model}</small></div><div className="service-row"><span>Completed</span><small>{new Date(state.item.createdAt).toLocaleString()}</small></div><div className="service-row"><span>Latency</span><small>{formatDuration(state.item.latencyMs)}</small></div><div className="service-row"><span>Provider cost</span><small>{state.item.costUsd === null ? "Not reported" : `$${state.item.costUsd.toFixed(4)}`}</small></div></div></>}
    {state.kind === "renameActivity" && <form className="activity-dialog-form" onSubmit={async (event) => { event.preventDefault(); setActivityBusy(true); setActivityError(""); const error = await onRenameActivity(state.item, activityTitle.trim()); if (error) setActivityError(error); setActivityBusy(false); }}><p className="dialog-lead">Choose a name for this saved {state.item.modality} generation.</p><label htmlFor="activity-title">ACTIVITY NAME</label><input id="activity-title" value={activityTitle} onChange={(event) => setActivityTitle(event.target.value)} maxLength={80} required autoFocus/><small>{activityTitle.trim().length}/80 characters</small>{activityError && <p className="activity-dialog-error" role="alert">{activityError}</p>}<div className="modal-footer"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={activityBusy || !activityTitle.trim()}>{activityBusy ? "Saving…" : "Save name"}</button></div></form>}
    {state.kind === "deleteActivity" && <div className="activity-dialog-form"><p className="dialog-lead">Delete <b>{state.item.title}</b> from recent activity? This removes its saved history entry from this workspace.</p>{activityError && <p className="activity-dialog-error" role="alert">{activityError}</p>}<div className="modal-footer"><button className="secondary-button" onClick={onClose}>Keep activity</button><button className="delete-button" disabled={activityBusy} onClick={async () => { setActivityBusy(true); setActivityError(""); const error = await onDeleteActivity(state.item); if (error) setActivityError(error); setActivityBusy(false); }}>{activityBusy ? "Deleting…" : "Delete activity"}</button></div></div>}
  </section></div>;
}

function LoginScreen({ configured, onLogin }: { configured: boolean; onLogin: (auth: AuthState) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Could not sign in."); return; }
      const session = await fetch("/api/auth/session").then((result) => result.json());
      onLogin(session);
    } catch { setError("Could not reach the sign-in service."); }
    finally { setBusy(false); }
  };
  return <main className="auth-screen"><section className="auth-card"><div className="auth-brand"><span className="brand-kicker">LOCAL WORKSPACE</span><strong>MOSAIC</strong></div><div className="auth-eyebrow">MULTIMODAL AI STUDIO</div><h1>Welcome back.</h1><p className="auth-intro">Sign in to your private creative workspace.</p>{configured ? <form className="login-form" onSubmit={submit}><label htmlFor="login-email">Email</label><input id="login-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required/><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/>{error && <div className="auth-error" role="alert">{error}</div>}<button className="auth-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowUpRight size={16}/></button></form> : <div className="auth-setup"><LockKeyhole size={18}/><b>Finish local sign-in setup</b><p>Add these values to your <code>.env.local</code> file, then restart the app:</p><pre>STUDIO_LOGIN_EMAIL=you@example.com<br/>STUDIO_LOGIN_PASSWORD=your-strong-password<br/>STUDIO_SESSION_SECRET=generate-a-random-secret<br/>STUDIO_WORKSPACE_ID=northstar</pre></div>}<div className="auth-footer"><ShieldCheck size={14}/> Protected by a signed, HTTP-only session cookie</div></section><span className="auth-copyright">Private workspace · Local model gateway</span></main>;
}

function Metric({ label, value, change, icon, note }: { label: string; value: string; change: string; icon: React.ReactNode; note: string }) {
  return <div className="metric-card"><div className="metric-top"><span className="metric-icon">{icon}</span><span className={`metric-change ${change === "Pending" || change === "Setup needed" ? "stable" : ""}`}>{change}</span></div><div className="metric-value">{value}</div><div className="metric-label">{label}</div><div className="metric-note">{note}</div></div>;
}

function Activity({ entry, menuOpen, onToggleMenu, onInspect, onRename, onDelete }: { entry: ActivityItem; menuOpen: boolean; onToggleMenu: () => void; onInspect: () => void; onRename: () => void; onDelete: () => void }) {
  const Icon = entry.modality === "text" ? MessageSquareText : entry.modality === "image" ? ImageIcon : entry.modality === "audio" ? FileAudio : Video;
  const cost = entry.costUsd === null ? "—" : `$${entry.costUsd.toFixed(4)}`;
  return <div className="activity-row"><div className="activity-name"><span className="activity-icon"><Icon size={15}/></span><div><b>{entry.title}</b><small>{entry.modality} · {new Date(entry.createdAt).toLocaleString()}</small></div></div><span className="model-name">{entry.model}</span><span className="status-badge"><i/> Complete</span><b className="activity-cost">{cost}</b><div className="activity-actions-wrap"><button className="icon-button row-menu" aria-label={`Activity options for ${entry.title}`} aria-expanded={menuOpen} onClick={onToggleMenu} title="Activity options"><MoreHorizontal size={17}/></button>{menuOpen && <div className="anchored-menu activity-menu"><button onClick={onInspect}><Clock3 size={14}/> View details</button><button onClick={onRename}><Settings2 size={14}/> Rename</button><button className="danger-menu-item" onClick={onDelete}><X size={14}/> Delete</button></div>}</div></div>;
}
