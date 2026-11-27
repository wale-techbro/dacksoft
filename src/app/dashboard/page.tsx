"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownLeft, ArrowUpRight, BookOpen, Check, ChevronDown, Command, Inbox, LayoutDashboard, Link2, Package, Send, Settings2, ShieldCheck, Sparkles, Users, WandSparkles } from "lucide-react";
import { customers, orders } from "@/lib/demo/data";

type Trace = { id: string; durationMs: number; usage: null | { promptTokens: number; completionTokens: number; totalTokens: number }; steps: Array<Record<string, unknown>> };

const navigation = [
  { title: "Workspace", items: [{ name: "Overview", icon: LayoutDashboard }, { name: "Inbox", icon: Inbox, count: "8" }, { name: "Knowledge base", icon: BookOpen }, { name: "Customers", icon: Users }, { name: "Orders", icon: Package }] },
  { title: "Manage", items: [{ name: "Integrations", icon: Link2 }, { name: "AI activity", icon: Activity }, { name: "Settings", icon: Settings2 }] },
];

export default function Home() {
  const [message, setMessage] = useState("Where is my order ORD-1004?");
  const [trace, setTrace] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState("Overview");
  const [tenantId, setTenantId] = useState("");
  const [workspace, setWorkspace] = useState<{ name: string; slug: string; environment: "demo" | "production"; role: string } | null>(null);
  const [memberships, setMemberships] = useState<Array<{ tenant_id: string; role: string; business_tenants: { name: string; slug: string; environment: "demo" | "production" } }>>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [thread, setThread] = useState<Array<{ role: "customer" | "assistant"; content: string }>>([]);
  const lastOrder = useMemo(() => orders.find((order) => order.id === "ORD-1004"), []);

  useEffect(() => {
    fetch("/api/workspace").then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? "Your session has expired. Sign in again." : "Could not load your workspaces.");
      const data = await response.json();
      const available = (data.memberships ?? []) as Array<{ tenant_id: string; role: string; business_tenants: { name: string; slug: string; environment: "demo" | "production" } }>;
      setMemberships(available);
      const storedId = window.localStorage.getItem("dacksoft-active-workspace");
      const membership = available.find((item) => item.tenant_id === storedId) ?? available[0];
      if (membership) {
        const tenant = membership.business_tenants;
        if (!tenant) throw new Error("Workspace details are unavailable.");
        window.localStorage.setItem("dacksoft-active-workspace", membership.tenant_id);
        setTenantId(membership.tenant_id);
        if (tenant) setWorkspace({ name: tenant.name, slug: tenant.slug, environment: tenant.environment, role: membership.role });
        const savedConversationId = window.localStorage.getItem(`dacksoft-conversation-${membership.tenant_id}`);
        if (savedConversationId) {
          setConversationId(savedConversationId);
          const history = await fetch(`/api/conversations/${savedConversationId}?tenantId=${membership.tenant_id}`);
          if (history.ok) {
            const previous = await history.json();
            setThread((previous.messages ?? []).filter((item: { role: string }) => item.role === "customer" || item.role === "assistant").map((item: { role: "customer" | "assistant"; content: string }) => ({ role: item.role, content: item.content })));
          }
        }
      } else setWorkspaceError("No workspace is linked to this account yet. Complete workspace setup to continue.");
    }).catch((cause) => setWorkspaceError(cause instanceof Error ? cause.message : "Could not load your workspaces.")).finally(() => setWorkspaceLoading(false));
  }, []);

  async function selectWorkspace(tenantId: string) {
    const membership = memberships.find((item) => item.tenant_id === tenantId);
    if (!membership?.business_tenants) return;
    window.localStorage.setItem("dacksoft-active-workspace", tenantId);
    setTenantId(tenantId);
    setWorkspace({ ...membership.business_tenants, role: membership.role });
    setConversationId(""); setThread([]); setTrace(null); setError("");
    const savedConversationId = window.localStorage.getItem(`dacksoft-conversation-${tenantId}`);
    if (savedConversationId) {
      try {
        const response = await fetch(`/api/conversations/${savedConversationId}?tenantId=${tenantId}`);
        if (!response.ok) return;
        const history = await response.json();
        setConversationId(savedConversationId);
        setThread((history.messages ?? []).filter((item: { role: string }) => item.role === "customer" || item.role === "assistant").map((item: { role: "customer" | "assistant"; content: string }) => ({ role: item.role, content: item.content })));
      } catch { setError("Could not load this workspace conversation history."); }
    }
  }

  async function ask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || loading) return;
    setLoading(true); setError("");
    try {
      if (!tenantId) throw new Error("Select a workspace before running the assistant.");
      if (workspace?.environment !== "demo" || workspace.slug !== "nexastore-demo") throw new Error("The sample order assistant is available only in the NexaStore demo workspace.");
      const submittedMessage = message.trim();
      setThread((current) => [...current, { role: "customer", content: submittedMessage }, { role: "assistant", content: "" }]);
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: submittedMessage, tenantId, stream: true, ...(conversationId ? { conversationId } : {}) }) });
      if (!response.ok) {
        const data = await response.json();
        if (data.conversationId) { setConversationId(data.conversationId); window.localStorage.setItem(`dacksoft-conversation-${tenantId}`, data.conversationId); }
        throw new Error(data.error ?? "The request could not be completed.");
      }
      if (!response.body) throw new Error("The assistant stream is unavailable.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let complete: { answer: string; trace: Trace; conversationId: string } | null = null;
      while (true) {
        const part = await reader.read();
        pending += decoder.decode(part.value, { stream: !part.done });
        let boundary = pending.indexOf("\n\n");
        while (boundary >= 0) {
          const block = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
          const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
          if (dataLine) {
            const event = JSON.parse(dataLine.slice(6));
            if (event.type === "delta") setThread((current) => current.map((item, index) => index === current.length - 1 && item.role === "assistant" ? { ...item, content: item.content + event.content } : item));
            if (event.type === "error") {
              if (event.conversationId) { setConversationId(event.conversationId); window.localStorage.setItem(`dacksoft-conversation-${tenantId}`, event.conversationId); }
              throw new Error(event.error ?? "The assistant stream failed.");
            }
            if (event.type === "done") complete = event;
          }
          boundary = pending.indexOf("\n\n");
        }
        if (part.done) break;
      }
      if (!complete) throw new Error("The assistant stream ended before a final answer arrived.");
      setTrace(complete.trace); setConversationId(complete.conversationId); window.localStorage.setItem(`dacksoft-conversation-${tenantId}`, complete.conversationId);
      setThread((current) => current.map((item, index) => index === current.length - 1 && item.role === "assistant" ? { ...item, content: complete!.answer } : item)); setMessage("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong."); }
    finally { setLoading(false); }
  }

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><WandSparkles size={18} /></div><span>Dacksoft</span><label className="org-switch"><span className="org-avatar">{workspace?.name.slice(0, 1) ?? "W"}</span><span className="org-copy"><strong>{workspace?.name ?? "Select workspace"}</strong><small>{workspace?.environment === "demo" ? "Demo workspace" : "Business workspace"}</small></span><select aria-label="Select workspace" value={tenantId} onChange={(event) => void selectWorkspace(event.target.value)} disabled={memberships.length < 2}>{memberships.map((membership) => <option key={membership.tenant_id} value={membership.tenant_id}>{membership.business_tenants.name}</option>)}</select><ChevronDown size={15} /></label></div>
      <div className="demo-flag"><span className="pulse" /> {workspace?.slug === "nexastore-demo" && workspace.environment === "demo" ? "Synthetic demo environment" : "Business workspace"}</div>
      {navigation.map((group) => <div className="nav-group" key={group.title}><div className="nav-label">{group.title}</div>{group.items.map(({ name, icon: Icon, count }) => <button key={name} className={`nav-item ${section === name ? "active" : ""}`} onClick={() => setSection(name)}><Icon size={17} strokeWidth={1.8} /><span>{name}</span>{count && <span className="nav-count">{count}</span>}</button>)}</div>)}
      <div className="sidebar-bottom"><form action="/auth/signout" method="post"><button className="profile" type="submit"><span className="profile-avatar">{workspace?.name.slice(0, 1) ?? "D"}</span><span className="profile-copy"><strong>{workspace?.name ?? "Workspace account"}</strong><small>Sign out</small></span></button></form></div>
    </aside>
    <section className="main-area">
      <header className="topbar"><div className="crumb"><span>{workspace?.name ?? "Workspace"}</span><span className="slash">/</span><strong>{section}</strong></div><div className="top-actions" /></header>
      <div className="content-wrap">{workspaceLoading ? <section className="panel empty-panel"><h3>Loading workspace…</h3></section> : workspaceError ? <section className="panel empty-panel"><h3>Workspace unavailable</h3><p>{workspaceError}</p>{workspaceError.startsWith("No workspace is linked") && <a className="primary-button" href="/onboarding">Set up workspace</a>}</section> : section === "Overview" ? workspace?.slug !== "nexastore-demo" || workspace.environment !== "demo" ? <ProductionOverview tenantId={tenantId} onNavigate={setSection} /> : <><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> NEXASTORE · SYNTHETIC DEMO</div><h1>Demo workspace overview</h1><p>Illustrative activity uses fictional NexaStore data.</p></div><button className="primary-button" onClick={() => setSection("Inbox")}><Inbox size={16} /> Open inbox</button></div>
        <div className="stat-grid">
          <Stat icon={<Users size={17} />} label="Synthetic customers" value={String(customers.length)} delta="Demo data" detail="fictional NexaStore records" tone="blue" />
          <Stat icon={<Package size={17} />} label="Synthetic orders" value={String(orders.length)} delta="Demo data" detail="fictional NexaStore records" tone="green" />
          <Stat icon={<BookOpen size={17} />} label="Demo policy sources" value="3" delta="Local examples" detail="not uploaded documents" tone="orange" />
          <Stat icon={<Activity size={17} />} label="Live Bridge status" value="Not verified" delta="API key needed" detail="no live run recorded" tone="purple" />
        </div>
        <div className="section-row"><div><h2>Support inbox</h2><p>Pick up where your customers left off.</p></div><button className="text-button" onClick={() => setSection("Inbox")}>View inbox <ArrowUpRight size={14} /></button></div>
        <div className="work-grid">
          <section className="panel inbox-panel"><div className="panel-heading"><div className="panel-title"><span className="channel-icon"><Inbox size={16} /></span><div><h3>Sample conversations</h3><p>Illustrative inbox items · not saved conversations</p></div></div></div>
            <div className="conversation-list"><Conversation initials="MK" color="rose" name="Maya K." subject="Order hasn’t arrived yet" preview="It was meant to be here yesterday..." time="Sample" badge="Needs review" /><Conversation initials="AO" color="blue" name="Ayo O." subject="Can I return my purchase?" preview="I ordered the wrong size by mistake." time="Sample" badge="AI handling" /><Conversation initials="TW" color="green" name="Tomi W." subject="Payment confirmation" preview="Just wanted to check if my order went through." time="Sample" badge="Resolved" /><Conversation initials="NA" color="amber" name="Nneka A." subject="Update delivery address" preview="Could you change the address before it ships?" time="Sample" badge="Needs review" /></div>
            <button className="inbox-footer" onClick={() => setSection("Inbox")}>Open all conversations <ArrowUpRight size={14} /></button>
          </section>
          <section className="panel activity-panel"><div className="panel-heading"><div className="panel-title"><span className="channel-icon lilac"><Activity size={16} /></span><div><h3>Example AI activity</h3><p>Illustrative events · no live runs recorded</p></div></div></div>
            <div className="timeline"><ActivityItem icon={<Package size={15} />} color="blue" title="Order status retrieved" subtitle="NexaStore demo connector · ORD-1004" time="Example" /><ActivityItem icon={<BookOpen size={15} />} color="green" title="Knowledge searched" subtitle="Shipping & delivery policy · local example" time="Example" /><ActivityItem icon={<Sparkles size={15} />} color="purple" title="AI reply sent" subtitle="Example only · no saved conversation" time="Example" /><ActivityItem icon={<ArrowDownLeft size={15} />} color="orange" title="Human handoff requested" subtitle="Example only · not a real handoff" time="Example" /></div>
            <button className="inbox-footer" onClick={() => setSection("AI activity")}>View activity log <ArrowUpRight size={14} /></button>
          </section>
        </div>
        <div className="section-row demo-row"><div><h2>Bridge order lookup</h2><p>After adding a server-side API key, inspect each tool-call step here.</p></div><span className="live-pill"><span className="pulse" /> Server tool calling</span></div>
        <div className="workflow-grid">
          <section className="panel chat-panel"><div className="chat-top"><div className="chat-bot"><div className="bot-mark"><Sparkles size={17} /></div><div><strong>Dacksoft assistant</strong><small><span className="online-dot" /> NexaStore support</small></div></div><span className="demo-tag">DEMO</span></div>
            <div className="chat-thread"><div className="chat-date">NEXASTORE · SYNTHETIC DEMO</div>{thread.map((item, index) => item.role === "customer" ? <div className="message customer-message" key={`customer-${index}`}><span className="small-avatar">AS</span><div><div className="bubble">{item.content}</div><small>Customer</small></div></div> : <div className="message assistant-message" key={`assistant-${index}`}><span className="bot-small"><Sparkles size={13} /></span><div><div className="bubble">{item.content}</div><div className="answer-meta"><span><Check size={12} /> Assistant response</span><span>saved</span></div></div></div>)}{error && <div className="error-box">{error}<span>Bridge requests are limited to authenticated NexaStore demo workspaces.</span></div>}{loading && <div className="thinking"><span /><span /><span /> Checking with the assistant...</div>}</div>
            <form className="composer" onSubmit={ask}><input value={message} onChange={(event) => setMessage(event.target.value)} aria-label="Customer message" placeholder="Ask about a customer or order..." maxLength={4000} /><button type="submit" aria-label="Send message" disabled={loading}><Send size={16} /></button><div className="composer-hint"><span><Command size={11} /> Return to send</span><span><ShieldCheck size={12} /> Secure tool execution</span></div></form>
          </section>
          <section className="panel inspector-panel"><div className="panel-heading inspector-heading"><div className="panel-title"><span className="channel-icon lilac"><Activity size={16} /></span><div><h3>Execution inspector</h3><p>{trace ? `Run ${trace.id.slice(0, 8)} · ${trace.durationMs}ms` : "See what happens behind the answer"}</p></div></div></div>
            <div className="trace-steps">{trace ? trace.steps.map((step, i) => <TraceStep key={`${String(step.type)}-${i}`} step={step} index={i + 1} />) : <><TracePreview index="01" title="Customer message received" detail="Where is my order ORD-1004?" tone="blue" /><TracePreview index="02" title="Bridge model request" detail="Model reviews the request and available tools" tone="purple" /><TracePreview index="03" title="Tool call validated" detail="get_order_status · Zod schema" tone="orange" /><TracePreview index="04" title="Demo order retrieved" detail={lastOrder ? `${lastOrder.id} · ${lastOrder.status}` : "NexaStore synthetic data"} tone="green" /><TracePreview index="05" title="Answer returned" detail="Grounded in verified order details" tone="blue" /></>}</div>
            <div className="trace-footer"><div className="trace-metric"><span>Response time</span><strong>{trace ? `${trace.durationMs} ms` : "—"}</strong></div><div className="trace-metric"><span>Provider token usage</span><strong>{trace?.usage ? `${trace.usage.totalTokens} tokens` : "Not reported"}</strong></div><span className="metric-note">Metrics from live Bridge response only</span></div>
          </section>
        </div>
        <footer className="page-foot"><span><ShieldCheck size={13} /> Your data stays protected</span><span>NexaStore records are synthetic demonstration data</span></footer>
      </> : <WorkspaceView section={section} trace={trace} tenantId={tenantId} isDemo={workspace?.slug === "nexastore-demo" && workspace.environment === "demo"} canManage={workspace?.role !== "viewer"} onNavigate={setSection} />}</div>
    </section>
  </main>;
}

function WorkspaceView({ section, trace, tenantId, isDemo, canManage, onNavigate }: { section: string; trace: Trace | null; tenantId: string; isDemo: boolean; canManage: boolean; onNavigate: (section: string) => void }) {
  const headings: Record<string, string> = {
    Inbox: "Inbox", "Knowledge base": "Knowledge base", Customers: "Customers", Orders: "Orders",
    Integrations: "Integrations", "AI activity": "AI activity", Settings: "Settings",
  };
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {isDemo ? "NEXASTORE · SYNTHETIC DEMO" : "PRIVATE WORKSPACE"}</div><h1>{headings[section] ?? section}</h1><p>{isDemo ? "Demo workspace information. Synthetic records are clearly marked." : "Workspace information is private to your selected business."}</p></div>{section === "Inbox" && isDemo && <button className="primary-button" onClick={() => onNavigate("Overview")}><Sparkles size={15} /> Try order lookup</button>}</div>
    {section === "Customers" && (isDemo ? <section className="panel data-panel"><div className="panel-heading"><div><h3>Customers</h3><p>{customers.length} fictional customer records</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Customer</th><th>Customer ID</th><th>Email</th><th>Phone</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td>{customer.id}</td><td>{customer.email}</td><td>{customer.phone}</td></tr>)}</tbody></table></div></section> : <WorkspaceConnectorEmpty kind="customer" onNavigate={onNavigate} />)}
    {section === "Orders" && (isDemo ? <section className="panel data-panel"><div className="panel-heading"><div><h3>Orders</h3><p>{orders.length} fictional orders · seed fixtures only</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Tracking</th></tr></thead><tbody>{orders.map((order) => { const customer = customers.find((item) => item.id === order.customerId); return <tr key={order.id}><td><strong>{order.id}</strong></td><td>{customer?.name ?? "Unknown"}</td><td>{order.items.join(", ")}</td><td>{new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(order.total)}</td><td><span className={`order-status ${order.status.toLowerCase().replaceAll(" ", "-")}`}>{order.status}</span></td><td>{order.trackingNumber ?? "Not available"}</td></tr>; })}</tbody></table></div></section> : <WorkspaceConnectorEmpty kind="order" onNavigate={onNavigate} />)}
    {section === "Knowledge base" && <div className="content-stack">{isDemo && <section className="panel data-panel"><div className="panel-heading"><div><h3>Demo policy sources</h3><p>Local synthetic examples · no uploaded business documents</p></div><span className="demo-tag">3 SOURCES</span></div><div className="source-list"><Source title="Shipping & delivery policy" section="Delivery windows" text="Standard delivery normally arrives within 3–7 business days after dispatch. Tracking details are shared when a carrier scan becomes available. Delivery estimates can change during carrier delays." /><Source title="Returns & refunds policy" section="Return window" text="Unused products in their original packaging may be returned within 30 calendar days of delivery. Final-sale items are not returnable. Refunds are reviewed by a human support agent after the return is received; this assistant cannot issue a refund." /><Source title="NexaStore FAQ" section="Order changes" text="Address changes may be possible before dispatch. Include the order number and contact support as soon as possible." /></div></section>}<KnowledgeDocuments tenantId={tenantId} canManage={canManage} /></div>}
    {section === "Integrations" && <div className="integration-grid">{isDemo && <IntegrationCard icon={<Package size={17} />} name="NexaStore demo connector" kind="Demo connector" status="Connected to synthetic records" detail="Customer and order lookup are served by the local, fictional dataset." />}<IntegrationCard icon={<Sparkles size={17} />} name="Bridge AI provider" kind="AI provider" status="Credentials are managed by the server" detail="Provider availability is checked when a request is made. Secrets are never displayed in this workspace." /></div>}
    {section === "AI activity" && <AIActivity tenantId={tenantId} currentTrace={trace} />}
    {section === "Inbox" && <InboxWorkspace tenantId={tenantId} canManage={canManage} />}
    {section === "Settings" && <section className="panel settings-panel"><div className="panel-heading"><div><h3>Workspace settings</h3><p>Current workspace and access details</p></div></div><SettingRow label="Workspace data" value={isDemo ? "NexaStore synthetic examples" : "Private business data"} /><SettingRow label="Workspace access" value={canManage ? "Member with management access" : "Viewer"} /><SettingRow label="Authentication" value="Supabase authenticated session" /><SettingRow label="Data isolation" value="Tenant scoped with database policies" /><SettingRow label="Knowledge documents" value="Private workspace storage" /></section>}
  </>;
}

function ProductionOverview({ tenantId, onNavigate }: { tenantId: string; onNavigate: (section: string) => void }) {
  return <><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> BUSINESS WORKSPACE</div><h1>Workspace overview</h1><p>Your workspace is private. Connect a business system to populate customers and orders.</p></div><button className="primary-button" onClick={() => onNavigate("Integrations")}><Link2 size={15} /> View integrations</button></div><div className="production-overview-grid"><div className="content-stack"><section className="panel empty-panel"><span className="empty-icon"><Link2 size={20} /></span><h3>No business connector connected</h3><p>This workspace is not using NexaStore sample data. Connect an authorized customer and order source before using order lookup tools.</p><button className="primary-button" onClick={() => onNavigate("Integrations")}>Open integrations</button></section><section className="panel empty-panel"><span className="empty-icon"><Inbox size={20} /></span><h3>Inbox is ready for conversations</h3><p>Uploaded policy documents can power grounded knowledge answers. Customer conversations will appear when you connect a support channel.</p><button className="primary-button" onClick={() => onNavigate("Knowledge base")}><BookOpen size={15} /> Open knowledge base</button></section></div><ProductionAssistant tenantId={tenantId} /></div></>;
}

function ProductionAssistant({ tenantId }: { tenantId: string }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "customer" | "assistant"; content: string }>>([]);
  const [conversationId, setConversationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const savedId = window.localStorage.getItem(`dacksoft-policy-chat-${tenantId}`);
    if (savedId) fetch(`/api/conversations/${savedId}?tenantId=${tenantId}`).then(async (response) => {
      if (!response.ok) return null;
      return await response.json();
    }).then((data) => {
      if (!active || !data) return;
      setConversationId(savedId);
      setMessages((data.messages ?? []).filter((item: { role: string }) => item.role === "customer" || item.role === "assistant").map((item: { role: "customer" | "assistant"; content: string }) => ({ role: item.role, content: item.content })));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [tenantId]);
  async function ask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || busy) return;
    const submitted = question.trim();
    setBusy(true); setError(""); setMessages((items) => [...items, { role: "customer", content: submitted }, { role: "assistant", content: "" }]);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, message: submitted, stream: true, ...(conversationId ? { conversationId } : {}) }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? "The assistant request failed."); }
      if (!response.body) throw new Error("The assistant stream is unavailable.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = ""; let final: { answer: string; conversationId: string } | null = null;
      while (true) {
        const chunk = await reader.read(); pending += decoder.decode(chunk.value, { stream: !chunk.done });
        let boundary = pending.indexOf("\n\n");
        while (boundary >= 0) {
          const block = pending.slice(0, boundary); pending = pending.slice(boundary + 2); const line = block.split("\n").find((item) => item.startsWith("data: "));
          if (line) {
            const eventData = JSON.parse(line.slice(6));
            if (eventData.type === "delta") setMessages((items) => items.map((item, index) => index === items.length - 1 ? { ...item, content: item.content + eventData.content } : item));
            if (eventData.type === "error") throw new Error(eventData.error ?? "The assistant stream failed.");
            if (eventData.type === "done") final = eventData;
          }
          boundary = pending.indexOf("\n\n");
        }
        if (chunk.done) break;
      }
      if (!final) throw new Error("The assistant stream ended before a final answer arrived.");
      setConversationId(final.conversationId); window.localStorage.setItem(`dacksoft-policy-chat-${tenantId}`, final.conversationId);
      setMessages((items) => items.map((item, index) => index === items.length - 1 ? { ...item, content: final!.answer } : item)); setQuestion("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The assistant request failed."); setMessages((items) => items.at(-1)?.role === "assistant" ? items.slice(0, -1) : items); }
    finally { setBusy(false); }
  }
  return <section className="panel production-assistant"><div className="panel-heading"><div><h3>Ask your business policies</h3><p>Answers use uploaded documents with source citations.</p></div><span className="demo-tag">DOCUMENT SEARCH</span></div><div className="production-chat-thread">{messages.map((item, index) => <article className={`inbox-message ${item.role}`} key={`${item.role}-${index}`}><small>{item.role === "customer" ? "You" : "Dacksoft"}</small><p>{item.content || (busy ? "Searching workspace documents…" : "")}</p></article>)}{!messages.length && <p className="document-empty">Ask about a policy after uploading a PDF or TXT file in the Knowledge Base.</p>}{error && <p className="document-message error" role="alert">{error}</p>}</div><form className="production-assistant-form" onSubmit={ask}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about a policy…" aria-label="Ask a business policy question" maxLength={4000} /><button className="primary-button" disabled={busy || !question.trim()}>{busy ? "Searching…" : "Ask assistant"}</button></form><p className="production-assistant-note">Order and customer lookup will be enabled after a real business connector is configured.</p></section>;
}

function WorkspaceConnectorEmpty({ kind, onNavigate }: { kind: "customer" | "order"; onNavigate: (section: string) => void }) {
  const label = kind === "customer" ? "Customer records" : "Order records";
  return <section className="panel empty-panel"><span className="empty-icon"><Link2 size={20} /></span><h3>{label} are not connected</h3><p>Connect an authorized business system to load real {kind} information. The fictional NexaStore fixtures are hidden in production workspaces.</p><button className="primary-button" onClick={() => onNavigate("Integrations")}>View integrations</button></section>;
}

type KnowledgeDocument = { id: string; name: string; mime_type: string; status: "queued" | "processing" | "ready" | "error"; created_at: string; error_message: string | null };

type InboxMessage = { id: string; role: "customer" | "assistant" | "agent" | "tool"; content: string; citations: Array<{ title: string; pageNumber?: number | null; section?: string | null }> | null; created_at: string };
type InboxConversation = { id: string; customer_id: string | null; status: "open" | "ai_handling" | "needs_human_review" | "resolved"; assigned_to: string | null; created_at: string; updated_at: string; messages: InboxMessage[] };

function InboxWorkspace({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = conversations.find((item) => item.id === selectedId) ?? conversations[0];
  const reload = useCallback(async () => {
    if (!tenantId) return;
    try {
      const response = await fetch(`/api/conversations?tenantId=${tenantId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load conversations.");
      const items = (data.conversations ?? []) as InboxConversation[];
      for (const item of items) item.messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
      setConversations(items);
      if (!selectedId && items[0]) setSelectedId(items[0].id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load conversations."); }
  }, [tenantId, selectedId]);
  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    fetch(`/api/conversations?tenantId=${tenantId}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load conversations.");
      const items = (data.conversations ?? []) as InboxConversation[];
      for (const item of items) item.messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
      if (active) { setConversations(items); if (items[0]) setSelectedId((current) => current || items[0].id); }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load conversations."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId]);

  async function update(patch: { status?: InboxConversation["status"]; assignedTo?: string | null }) {
    if (!selected) return;
    setError(""); setNotice("");
    try {
      const response = await fetch(`/api/conversations/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, ...patch }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update conversation.");
      setConversations((items) => items.map((item) => item.id === selected.id ? { ...item, status: data.conversation.status, assigned_to: data.conversation.assigned_to, updated_at: data.conversation.updated_at } : item));
      setNotice("Conversation updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update conversation."); }
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !message.trim() || loading) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/conversations/${selected.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, content: message }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not send reply.");
      setConversations((items) => items.map((item) => item.id === selected.id ? { ...item, status: "needs_human_review", assigned_to: item.assigned_to, updated_at: data.message.created_at, messages: [...item.messages, data.message] } : item));
      setMessage(""); setNotice("Your reply was saved and assigned to you.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send reply."); }
    finally { setLoading(false); }
  }

  if (!tenantId) return <section className="panel empty-panel"><span className="empty-icon"><Inbox size={20} /></span><h3>Sign in to load the inbox</h3><p>Saved conversations are private to their workspace.</p></section>;
  return <div className="inbox-workspace"><section className="panel inbox-queue"><div className="panel-heading"><div><h3>Conversations</h3><p>{conversations.length} saved in this workspace</p></div><button type="button" className="text-button" onClick={() => void reload()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>{error && <p className="document-message error" role="alert">{error}</p>}{conversations.length ? conversations.map((item) => <button type="button" key={item.id} className={`inbox-queue-item ${item.id === selected?.id ? "selected" : ""}`} onClick={() => setSelectedId(item.id)}><strong>{item.customer_id ? `Customer ${item.customer_id.slice(0, 8)}` : "Workspace conversation"}</strong><span>{item.messages.at(-1)?.content ?? "No messages yet"}</span><small>{item.status.replaceAll("_", " ")} · {new Date(item.updated_at).toLocaleString()}</small></button>) : !loading && <div className="inbox-empty"><Inbox size={18} /><strong>No saved conversations</strong><span>New conversations created through the assistant will appear here.</span></div>}</section>
    <section className="panel inbox-detail">{selected ? <><div className="panel-heading"><div><h3>{selected.customer_id ? `Customer ${selected.customer_id}` : "Workspace conversation"}</h3><p>Created {new Date(selected.created_at).toLocaleString()}</p></div><span className={`document-status ${selected.status}`}>{selected.status.replaceAll("_", " ")}</span></div><div className="inbox-messages">{selected.messages.map((item) => <article className={`inbox-message ${item.role}`} key={item.id}><small>{item.role}</small><p>{item.content}</p>{item.citations?.length ? <div className="inbox-citations">Sources: {item.citations.map((source, index) => <span key={`${source.title}-${index}`}>{source.title}{source.pageNumber ? ` · p. ${source.pageNumber}` : ""}</span>)}</div> : null}</article>)}</div>{canManage && <div className="inbox-controls"><div className="inbox-actions"><label>Status<select value={selected.status} onChange={(event) => void update({ status: event.target.value as InboxConversation["status"] })}><option value="open">Open</option><option value="ai_handling">AI handling</option><option value="needs_human_review">Needs human review</option><option value="resolved">Resolved</option></select></label><button className="secondary-button" type="button" onClick={() => void update({ assignedTo: "self" })}>Assign to me</button></div><form className="agent-reply" onSubmit={send}><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} placeholder="Write an agent reply…" aria-label="Agent reply" /><button className="primary-button" disabled={loading || !message.trim()}>{loading ? "Saving…" : "Send reply"}</button></form></div>}</> : <div className="inbox-empty"><Inbox size={18} /><strong>Select a conversation</strong><span>Conversation history and actions will appear here.</span></div>}{notice && <p className="document-message success" role="status">{notice}</p>}</section></div>;
}

type ActivityRun = { id: string; conversation_id: string | null; provider: string; model: string | null; status: string; duration_ms: number | null; provider_usage: { totalTokens?: number } | null; trace: Array<Record<string, unknown>>; created_at: string };

function AIActivity({ tenantId, currentTrace }: { tenantId: string; currentTrace: Trace | null }) {
  const [runs, setRuns] = useState<ActivityRun[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    fetch(`/api/activity?tenantId=${tenantId}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load AI activity.");
      if (active) setRuns(data.activity ?? []);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load AI activity."); });
    return () => { active = false; };
  }, [tenantId]);
  return <section className="panel data-panel"><div className="panel-heading"><div><h3>AI execution history</h3><p>Saved runs from this workspace</p></div></div>{error && <p className="document-message error" role="alert">{error}</p>}{runs.length ? <div className="activity-runs">{runs.map((run) => <article className="activity-run" key={run.id}><div><strong>{run.provider} · {run.model ?? "default model"}</strong><small>{new Date(run.created_at).toLocaleString()} · {run.duration_ms ?? "—"} ms</small></div><span className={`document-status ${run.status === "succeeded" ? "ready" : "error"}`}>{run.status}</span><p>{run.trace.map((step) => step.type === "tool_execution" ? `${String(step.name)}: ${String(step.status)}` : String(step.type)).join(" · ") || "No execution steps were saved."}</p><small>{run.provider_usage?.totalTokens ? `${run.provider_usage.totalTokens} provider-reported tokens` : "Token usage not reported"}</small></article>)}</div> : currentTrace ? <><div className="trace-steps session-trace">{currentTrace.steps.map((step, index) => <TraceStep key={`${String(step.type)}-${index}`} step={step} index={index + 1} />)}</div><EmptyState title="No saved AI runs" detail="The visible trace is from the current browser session. Saved activity will appear after database logging is configured." /></> : <EmptyState title="No AI activity yet" detail="Successful and failed assistant runs are stored here when database logging is available." />}</section>;
}

function KnowledgeDocuments({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    if (!tenantId) return;
    try {
      const response = await fetch(`/api/documents?tenantId=${tenantId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load documents.");
      setDocuments(data.documents ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load documents."); }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    fetch(`/api/documents?tenantId=${tenantId}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load documents.");
      if (active) setDocuments(data.documents ?? []);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load documents."); });
    return () => { active = false; };
  }, [tenantId]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !file || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.set("tenantId", tenantId); form.set("file", file);
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The document could not be processed.");
      setNotice(`${data.document.name} indexed into ${data.chunkCount} searchable sections.`);
      setFile(null);
      const input = document.getElementById("knowledge-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The document could not be processed."); await reload(); }
    finally { setBusy(false); }
  }

  async function removeDocument(documentId: string, name: string) {
    if (!window.confirm(`Delete “${name}” and its indexed text?`)) return;
    setError(""); setNotice("");
    try {
      const response = await fetch(`/api/documents/${documentId}?tenantId=${tenantId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The document could not be deleted.");
      setNotice(`${name} and its indexed sections were deleted.`);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The document could not be deleted."); }
  }

  return <section className="panel data-panel"><div className="panel-heading"><div><h3>Uploaded documents</h3><p>PDF and UTF-8 TXT · up to 8 MB · private to this workspace</p></div>{documents.length > 0 && <span className="demo-tag">{documents.length} DOCUMENTS</span>}</div>
    {canManage && <form className="document-upload" onSubmit={upload}><label htmlFor="knowledge-file">Choose a PDF or TXT file<input id="knowledge-file" type="file" accept=".pdf,application/pdf,.txt,text/plain" onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} disabled={busy || !tenantId} /></label><button className="primary-button" disabled={busy || !file || !tenantId}>{busy ? "Processing…" : "Upload and index"}</button><span>Text is extracted, split into passages, embedded, and stored with page citations.</span></form>}
    {!tenantId && <p className="document-empty">Sign in and select a workspace before uploading documents.</p>}
    {error && <p className="document-message error" role="alert">{error}</p>}{notice && <p className="document-message success" role="status">{notice}</p>}
    {documents.length ? <div className="source-list">{documents.map((item) => <article className="source-row document-row" key={item.id}><span className="source-icon"><BookOpen size={15} /></span><div><strong>{item.name}</strong><small>{item.mime_type === "application/pdf" ? "PDF" : "TXT"} · {new Date(item.created_at).toLocaleDateString()}</small>{item.error_message && <p>{item.error_message}</p>}</div><span className={`document-status ${item.status}`}>{item.status}</span>{canManage && <button type="button" className="document-delete" onClick={() => void removeDocument(item.id, item.name)} aria-label={`Delete ${item.name}`}>Delete</button>}</article>)}</div> : tenantId && <p className="document-empty">No uploaded documents yet. Upload a policy or FAQ to add grounded answers.</p>}
  </section>;
}

function Source({ title, section, text }: { title: string; section: string; text: string }) {
  return <article className="source-row"><span className="source-icon"><BookOpen size={15} /></span><div><strong>{title}</strong><small>{section} · synthetic demo source</small><p>{text}</p></div><span className="ready-pill">Example</span></article>;
}
function IntegrationCard({ icon, name, kind, status, detail }: { icon: React.ReactNode; name: string; kind: string; status: string; detail: string }) {
  return <section className="panel integration-card"><div className="integration-card-head"><span className="channel-icon lilac">{icon}</span><span className="demo-tag">{kind}</span></div><h3>{name}</h3><strong className="integration-status">{status}</strong><p>{detail}</p></section>;
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><span className="empty-icon"><Activity size={19} /></span><strong>{title}</strong><p>{detail}</p></div>;
}
function SettingRow({ label, value }: { label: string; value: string }) {
  return <div className="setting-row"><span>{label}</span><strong>{value}</strong></div>;
}

function Stat({ icon, label, value, delta, detail, tone }: { icon: React.ReactNode; label: string; value: string; delta: string; detail: string; tone: string }) {
  return <article className="stat-card"><div className="stat-head"><span className={`stat-icon ${tone}`}>{icon}</span></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-delta"><span className={tone === "orange" || tone === "purple" ? "neutral-delta" : "positive-delta"}>{delta}</span> {detail}</div></article>;
}
function Conversation({ initials, color, name, subject, preview, time, badge }: { initials: string; color: string; name: string; subject: string; preview: string; time: string; badge: string }) {
  return <article className="conversation"><span className={`customer-avatar ${color}`}>{initials}</span><span className="conversation-body"><span className="conversation-line"><strong>{name}</strong><time>{time}</time></span><span className="conversation-subject">{subject}</span><span className="conversation-preview">{preview}</span><span className={`conversation-badge ${badge.toLowerCase().replaceAll(" ", "-")}`}>{badge}</span></span></article>;
}
function ActivityItem({ icon, color, title, subtitle, time }: { icon: React.ReactNode; color: string; title: string; subtitle: string; time: string }) {
  return <div className="activity-item"><span className={`activity-icon ${color}`}>{icon}</span><div className="activity-copy"><strong>{title}</strong><span>{subtitle}</span></div><time>{time}</time></div>;
}
function TracePreview({ index, title, detail, tone }: { index: string; title: string; detail: string; tone: string }) {
  return <div className="trace-step"><span className={`trace-number ${tone}`}>{index}</span><div className="trace-text"><strong>{title}</strong><span>{detail}</span></div><Check className="trace-check" size={14} /></div>;
}
function TraceStep({ step, index }: { step: Record<string, unknown>; index: number }) {
  const isTool = step.type === "tool_execution";
  const title = isTool ? `${String(step.name)} ${step.status === "success" ? "executed" : "failed"}` : step.type === "model_response" ? "Bridge model response" : "Provider error";
  const detail = isTool ? (step.error ? String(step.error) : JSON.stringify(step.result)) : step.type === "model_response" ? String(step.content ?? (Array.isArray(step.toolCalls) ? `${step.toolCalls.length} tool call(s) requested` : "Tool request received")) : String(step.code);
  return <TracePreview index={String(index).padStart(2, "0")} title={title} detail={detail} tone={isTool ? "orange" : "purple"} />;
}
