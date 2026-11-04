"use client";

import { FormEvent, useEffect, useState } from "react";
import { AudioLines, BarChart3, BookOpen, Check, ChevronDown, CircleHelp, Clock3, FileAudio, Image as ImageIcon, LayoutDashboard, LockKeyhole, MessageSquareText, MoreHorizontal, PanelLeftClose, Plus, Search, Settings2, Shield, ShieldCheck, Sparkles, Video, WandSparkles, X } from "lucide-react";

type Tool = "Text" | "Image" | "Audio" | "Video";
type AudioAction = "transcribe" | "speak";
type AuthState = { authenticated: boolean; configured: boolean; guardConfigured?: boolean; email?: string; workspaceId?: string };
type PromptItem = { id: string; title: string; content: string; version: number; updatedAt: string };
type ActivityItem = { id: string; title: string; modality: string; model: string; status: "complete"; costUsd: number | null; latencyMs: number; createdAt: string };
type MediaResult = { url: string; mimeType: string; label: string; latencyMs: number | null };
function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
const navItems = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Text studio", icon: MessageSquareText, tool: "Text" as Tool },
  { name: "Image studio", icon: ImageIcon, tool: "Image" as Tool },
  { name: "Audio studio", icon: AudioLines, tool: "Audio" as Tool },
  { name: "Video studio", icon: Video, tool: "Video" as Tool },
];
const tools: { name: Tool; icon: typeof MessageSquareText; detail: string; model: string; placeholder: string; button: string }[] = [
  { name: "Text", icon: MessageSquareText, detail: "Write, reason, and refine", model: "Ollama · Qwen 2.5 3B", placeholder: "Describe what you’d like to create…", button: "Generate text" },
  { name: "Image", icon: ImageIcon, detail: "Generate and safety-check visuals", model: "ComfyUI workflow", placeholder: "A sunlit reading nook with trailing plants, warm film grain…", button: "Generate image" },
  { name: "Audio", icon: AudioLines, detail: "Transcribe audio or create speech", model: "Whisper · XTTS v2", placeholder: "Write the words you want spoken…", button: "Create speech" },
  { name: "Video", icon: Video, detail: "Create a scene from a prompt", model: "ComfyUI video workflow", placeholder: "Describe a short scene, camera movement, and mood…", button: "Generate video" },
];

export default function Home() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [active, setActive] = useState<Tool>("Text");
  const [prompt, setPrompt] = useState("");
  const [generatedText, setGeneratedText] = useState("");
  const [generatedLabel, setGeneratedLabel] = useState("AI-GENERATED");
  const [mediaResult, setMediaResult] = useState<MediaResult | null>(null);
  const [audioAction, setAudioAction] = useState<AudioAction>("transcribe");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string | undefined>();
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const totalSpend = activity.reduce((sum, item) => sum + (item.costUsd ?? 0), 0);
  const spendKnown = activity.length > 0 && activity.every((item) => item.costUsd !== null);
  const averageLatency = activity.length ? Math.round(activity.reduce((sum, item) => sum + item.latencyMs, 0) / activity.length) : null;
  const userName = auth?.email?.split("@")[0] ?? "Workspace member";
  const initials = auth?.email?.split("@")[0]?.slice(0, 2).toUpperCase() ?? "ME";
  const selected = tools.find((tool) => tool.name === active)!;
  const selectTool = (tool: Tool) => { setActive(tool); setNotice(""); setGeneratedText(""); setGeneratedLabel("AI-GENERATED"); setMediaResult(null); setAudioFile(null); };
  const refreshWorkspace = async () => {
    const [promptResponse, activityResponse] = await Promise.all([fetch("/api/prompts"), fetch("/api/activity")]);
    if (promptResponse.ok) setPrompts((await promptResponse.json()).prompts);
    if (activityResponse.ok) setActivity((await activityResponse.json()).activity);
  };
  useEffect(() => {
    fetch("/api/auth/session").then((response) => response.json()).then(async (data: AuthState) => {
      setAuth(data);
      if (data.authenticated) await refreshWorkspace();
    }).catch(() => setAuth({ authenticated: false, configured: false })).finally(() => setAuthLoading(false));
  }, []);
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuth((current) => current ? { ...current, authenticated: false } : current);
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
        response = await fetch("/api/media/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modality: active.toLowerCase(), prompt }) });
      } else {
        response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modality: "text", prompt }) });
      }
      const data = await response.json();
      if (response.status === 401) { setAuth((current) => current ? { ...current, authenticated: false } : current); return; }
      if (!response.ok) { setNotice(data.error ?? (response.status === 503 && active === "Text" ? "Configure LiteLLM and the safety model in .env.local to generate text." : "Generation could not be completed.")); return; }
      if (data.text) { setGeneratedText(data.text); setGeneratedLabel(transcribing ? "TRANSCRIPT" : "AI-GENERATED"); }
      if (data.url && data.mimeType) setMediaResult({ url: data.url, mimeType: data.mimeType, latencyMs: typeof data.latencyMs === "number" ? data.latencyMs : null, label: transcribing ? "TRANSCRIPT · SAFETY CHECK PASSED" : "AI-GENERATED · SAFETY CHECKS PASSED" });
      const elapsed = typeof data.latencyMs === "number" ? `Completed in ${formatDuration(data.latencyMs)}` : "Completed";
      setNotice(`Safety checks passed · ${elapsed} · Cost tracking will appear when the provider reports cost data.`);
      await refreshWorkspace();
    } catch { setNotice("Could not reach the studio API. Check that the app server is running."); }
    finally { setGenerating(false); }
  };

  if (authLoading) return <div className="auth-loading"><div className="brand-mark"><Sparkles size={17}/></div><span>Loading your workspace…</span></div>;
  if (!auth?.authenticated) return <LoginScreen configured={Boolean(auth?.configured)} onLogin={(nextAuth) => { setAuth(nextAuth); void refreshWorkspace(); }} />;

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={17} strokeWidth={2.2}/></div><span>mosaic</span><button className="icon-button collapse" aria-label="Collapse navigation"><PanelLeftClose size={17}/></button></div>
      <button className="workspace"><span className="workspace-avatar">{auth?.workspaceId?.slice(0, 1).toUpperCase() ?? "W"}</span><span className="workspace-copy"><b>{auth?.workspaceId ?? "Workspace"}</b><small>Private workspace</small></span><ChevronDown size={15}/></button>
      <button className="new-project" onClick={() => selectTool("Text")}><Plus size={16}/> New generation <span>⌘ K</span></button>
      <div className="nav-label">WORKSPACE</div>
      <nav>{navItems.map(({ name, icon: Icon, tool }) => <button key={name} onClick={() => tool && selectTool(tool)} className={`nav-link ${tool === active ? "selected" : ""}`}><Icon size={17}/><span>{name}</span>{name === "Overview" && <span className="nav-dot"/>}</button>)}</nav>
      <button className={`nav-link library-link ${showLibrary ? "selected" : ""}`} onClick={() => setShowLibrary(!showLibrary)}><BookOpen size={17}/><span>Prompt library</span><span className="library-count">{prompts.length}</span></button>
      {showLibrary && <div className="library-popover"><div><b>Prompt library</b><button aria-label="Close prompt library" onClick={() => setShowLibrary(false)}><X size={14}/></button></div>{prompts.map((item) => <button className="saved-prompt" key={item.id} onClick={() => { setPrompt(item.content); setSelectedPromptId(item.id); selectTool("Text"); setShowLibrary(false); }}>✦ {item.title}<small>v{item.version} · Updated {new Date(item.updatedAt).toLocaleDateString()}</small></button>)}{prompts.length === 0 && <p className="empty-prompts">No saved prompts yet. Save one from the editor.</p>}<button className="library-manage" onClick={() => { setPrompt(""); setSelectedPromptId(undefined); setShowLibrary(false); }}>New prompt <span>＋</span></button></div>}
      <div className="nav-spacer"/><div className="nav-label">GOVERNANCE</div>
      <button className="nav-link" onClick={() => setNotice("Workspace policy: use AI responsibly, protect personal data, and report concerns to your workspace admin.")}><ShieldCheck size={17}/><span>Safety center</span><span className="status-pip"/></button>
      <button className="nav-link" onClick={() => setNotice("Settings demo: add server-side provider keys to .env.local to connect models.")}><Settings2 size={17}/><span>Settings</span></button>
      <div className="sidebar-bottom"><div className="usage-card"><div className="usage-heading"><span>Saved generations</span><CircleHelp size={14}/></div><div className="usage-amount">{activity.length}<span> in this workspace</span></div><div className="usage-caption">{spendKnown ? `Tracked model costs: $${totalSpend.toFixed(2)}` : "Cost data unavailable from gateway"}</div></div><button className="profile" onClick={signOut} title="Sign out"><div className="profile-avatar">{initials}</div><span><b>{auth?.email}</b><small>Sign out</small></span><MoreHorizontal size={18}/></button></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="slash">/</span><b>{active === "Text" ? "Create" : `${active} studio`}</b></div><div className="top-actions"><div className="environment"><span/> Signed in · private workspace</div><button className="search-button" onClick={() => setNotice("Search prompts, generations, and activity.")}><Search size={15}/><span>Search</span><kbd>⌘ K</kbd></button><button className="help-button" aria-label="Help"><CircleHelp size={17}/></button><div className="mini-avatar">{initials}</div></div></header>

      <div className="content">
        <div className="welcome-row"><div><div className="eyebrow"><span className="live-indicator"/> YOUR CREATIVE WORKSPACE</div><h1>Welcome, {userName} <span>✳</span></h1><p>What will you bring to life today?</p></div><button className="date-filter"><Clock3 size={15}/> All saved activity <ChevronDown size={14}/></button></div>

        <div className="metrics-grid"><Metric label="Generations" value={String(activity.length)} change="Saved" icon={<Sparkles size={16}/>} tone="violet" note="in this workspace"/><Metric label="Tracked spend" value={spendKnown ? `$${totalSpend.toFixed(2)}` : "—"} change={spendKnown ? "Tracked" : "Pending"} icon={<BarChart3 size={16}/>} tone="mint" note={spendKnown ? "reported by provider" : "gateway cost data unavailable"}/><Metric label="Avg. latency" value={averageLatency === null ? "—" : `${(averageLatency / 1000).toFixed(1)}s`} change={activity.length ? "Tracked" : "Pending"} icon={<Clock3 size={16}/>} tone="amber" note="saved generations"/><Metric label="Safety checks" value={activity.length ? "Passed" : "—"} change={activity.length ? "Tracked" : "Pending"} icon={<ShieldCheck size={16}/>} tone="blue" note={activity.length ? `${activity.length} safety-cleared outputs` : "No generations recorded"}/></div>

        <div className="studio-heading"><div><h2>Create something new</h2><p>One workspace. Every modality. Safety built in.</p></div><button className="text-button" onClick={() => setShowLibrary(true)}><BookOpen size={15}/> Browse prompts</button></div>
        <section className="studio-card"><div className="tool-tabs">{tools.map(({name,icon:Icon}) => <button key={name} className={`tool-tab ${active === name ? "active" : ""}`} onClick={() => selectTool(name)}><Icon size={16}/>{name}{name === "Audio" && <span className="soon">STT + TTS</span>}</button>)}</div>
          <div className="studio-body"><div className="model-row"><div className="model-picker"><span className="model-spark">✦</span><span>{selected.model}</span><ChevronDown size={14}/></div><span className="model-meta">{selected.detail}</span><button className="icon-button settings-icon" aria-label="Model settings"><Settings2 size={16}/></button></div>
            {active === "Audio" && <div className="audio-mode-switch" role="group" aria-label="Audio task"><button className={audioAction === "transcribe" ? "chosen" : ""} onClick={() => { setAudioAction("transcribe"); setNotice(""); setGeneratedText(""); setMediaResult(null); }}>Transcribe audio</button><button className={audioAction === "speak" ? "chosen" : ""} onClick={() => { setAudioAction("speak"); setNotice(""); setGeneratedText(""); setMediaResult(null); }}>Create speech</button></div>}
            {active === "Audio" && audioAction === "transcribe" ? <div className="upload-field"><label className="prompt-label" htmlFor="audio-upload">AUDIO FILE · MAX 25 MB</label><input id="audio-upload" type="file" onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}/>{audioFile && <span className="upload-filename">{audioFile.name} · {(audioFile.size / (1024 * 1024)).toFixed(1)} MB</span>}</div> : <><label className="prompt-label" htmlFor="prompt">{active === "Audio" ? "TEXT TO SPEAK" : active === "Image" ? "DESCRIBE YOUR IMAGE" : active === "Video" ? "DESCRIBE YOUR VIDEO" : "YOUR PROMPT"}</label><textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={selected.placeholder}/></>}
            <div className="editor-footer"><div className="editor-hints"><span><LockKeyhole size={13}/> Private to your workspace</span><span className="hint-divider">·</span><span>{prompt.length} / 4,000</span></div><div className="editor-actions">{active === "Text" && <button className="save-prompt-button" onClick={saveCurrentPrompt} disabled={savingPrompt}><BookOpen size={14}/>{savingPrompt ? "Saving…" : "Save prompt"}</button>}<button className="generate-button" onClick={generate} disabled={generating}><WandSparkles size={16}/>{generating ? "Working…" : active === "Audio" ? audioAction === "transcribe" ? "Transcribe audio" : "Create speech" : selected.button}<span>→</span></button></div></div>
            {saveMessage && <div className="save-message">{saveMessage}<button onClick={() => setSaveMessage("")} aria-label="Dismiss"><X size={13}/></button></div>}
            {notice && <div className="notice"><ShieldCheck size={15}/><span>{notice}</span><button aria-label="Dismiss" onClick={() => setNotice("")}><X size={14}/></button></div>}
            {generatedText && <section className="generated-output"><div className="output-label"><span><Sparkles size={13}/> {generatedLabel}</span><span className="output-safety"><ShieldCheck size={13}/> Safety checks passed</span></div><p>{generatedText}</p></section>}
            {mediaResult && <section className="media-result"><div className="output-label"><span><Sparkles size={13}/>{mediaResult.label}</span><a href={mediaResult.url} download>Download</a></div>{mediaResult.mimeType.startsWith("image/") ? <><img src={mediaResult.url} alt="AI-generated visual"/>{mediaResult.latencyMs !== null && <div className="media-details"><span><Clock3 size={12}/> Completed in {formatDuration(mediaResult.latencyMs)} · includes safety checks</span></div>}</> : mediaResult.mimeType.startsWith("video/") ? <video src={mediaResult.url} controls/> : <audio src={mediaResult.url} controls/>}</section>}
            <div className="safety-strip"><div className="safety-icon"><Shield size={15}/></div><div><b>Mosaic Guard · {auth.guardConfigured ? "configured" : "not configured"}</b><span>{auth.guardConfigured ? "Input and output checks are required for text generation" : "Configure the LiteLLM guard model before generating"}</span></div><span className={`guard-status ${auth.guardConfigured ? "" : "demo-status"}`}>{auth.guardConfigured ? "READY" : "SETUP"}</span></div>
          </div>
        </section>

        <div className="lower-grid"><section className="activity-card"><div className="section-title"><div><h3>Recent activity</h3><p>Saved generations in this workspace</p></div><span className="record-count">{activity.length} saved</span></div><div className="activity-table"><div className="table-head"><span>GENERATION</span><span>MODEL</span><span>STATUS</span><span>COST</span><span/></div>{activity.slice(0, 4).map((entry) => <Activity key={entry.id} entry={entry}/>)}{activity.length === 0 && <div className="empty-activity">No generations recorded yet. Completed and safety-checked requests will appear here.</div>}</div></section>
          <section className="governance-card"><div className="section-title"><div><h3>Workspace records</h3><p>Data saved locally for this workspace</p></div><ShieldCheck size={17}/></div><div className="governance-list"><div><span className="check-circle"><Check size={11}/></span><span>Signed-in account</span><b>Active</b></div><div><span className="check-circle"><Check size={11}/></span><span>Versioned prompts</span><b>{prompts.length} saved</b></div><div><span className="check-circle"><Check size={11}/></span><span>Generation history</span><b>{activity.length} saved</b></div></div><button className="policy-link" onClick={() => setNotice("Acceptable use: do not create harmful or unlawful content. Avoid unnecessary personal or confidential data. Report issues to your workspace administrator.")}>Read governance policy <span>→</span></button></section></div>
        <footer className="footer"><span>© 2026 Mosaic AI Studio</span><span><span className="footer-status"/>Signed in as {auth?.email}</span><a href="#governance" onClick={(event) => { event.preventDefault(); setNotice("Prompts and generation metadata are saved to this local workspace. Provider cost details are unavailable until the gateway reports them."); }}>Privacy &amp; safety <span>↗</span></a></footer>
      </div>
    </section>
    {showLibrary && <button className="popover-dismiss" aria-label="Close prompt library" onClick={() => setShowLibrary(false)}/>}
  </main>;
}

function LoginScreen({configured,onLogin}:{configured:boolean;onLogin:(auth:AuthState)=>void}) {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setBusy(true);setError("");
    try{
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
      const data=await response.json();
      if(!response.ok){setError(data.error??"Could not sign in.");return;}
      const session=await fetch("/api/auth/session").then((result)=>result.json());
      onLogin(session);
    }catch{setError("Could not reach the sign-in service.");}
    finally{setBusy(false);}
  };
  return <main className="auth-screen"><div className="auth-card"><div className="auth-brand"><div className="brand-mark"><Sparkles size={17}/></div><span>mosaic</span></div><div className="auth-eyebrow">MULTIMODAL AI STUDIO</div><h1>Welcome back</h1><p className="auth-intro">Sign in to your private creative workspace.</p>{configured?<form className="login-form" onSubmit={submit}><label htmlFor="login-email">Email</label><input id="login-email" type="email" autoComplete="username" value={email} onChange={(event)=>setEmail(event.target.value)} required/><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event)=>setPassword(event.target.value)} required/>{error&&<div className="auth-error" role="alert">{error}</div>}<button className="auth-submit" type="submit" disabled={busy}>{busy?"Signing in…":"Sign in"}<span>→</span></button></form>:<div className="auth-setup"><div className="setup-icon"><LockKeyhole size={17}/></div><b>Finish local sign-in setup</b><p>Add these values to your <code>.env.local</code> file, then restart the app:</p><pre>STUDIO_LOGIN_EMAIL=you@example.com<br/>STUDIO_LOGIN_PASSWORD=your-strong-password<br/>STUDIO_SESSION_SECRET=generate-a-random-32+-character-secret<br/>STUDIO_WORKSPACE_ID=northstar</pre><span>Credentials stay on the server and are not stored in the browser.</span></div>}<div className="auth-footer"><ShieldCheck size={14}/> Protected by a signed, HTTP-only session cookie</div></div><span className="auth-copyright">Mosaic AI Studio · Private workspace</span></main>;
}

function Metric({label,value,change,icon,tone,note}:{label:string;value:string;change:string;icon:React.ReactNode;tone:string;note:string}) { return <div className="metric-card"><div className="metric-top"><span className={`metric-icon ${tone}`}>{icon}</span><span className={`metric-change ${change === "Pending" ? "stable" : ""}`}>{change}</span></div><div className="metric-value">{value}</div><div className="metric-label">{label}</div><div className="metric-note">{note}</div></div>; }
function Activity({entry}:{entry:ActivityItem}) { const tone=entry.modality==="text"?"purple":entry.modality==="image"?"orange":"green";const Icon=entry.modality==="text"?MessageSquareText:entry.modality==="image"?ImageIcon:entry.modality==="audio"?FileAudio:Video;const cost=entry.costUsd===null?"—":`$${entry.costUsd.toFixed(4)}`;return <div className="activity-row"><div className="activity-name"><span className={`activity-icon ${tone}`}><Icon size={15}/></span><div><b>{entry.title}</b><small>{entry.modality} · {new Date(entry.createdAt).toLocaleString()}</small></div></div><span className="model-name">{entry.model}</span><span className="status-badge"><i/> Complete</span><b className="activity-cost">{cost}</b><button className="icon-button row-menu" aria-label={`More options for ${entry.title}`}><MoreHorizontal size={17}/></button></div>; }
