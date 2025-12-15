import React, { useState, useEffect, useRef } from "react";
import "../styles/tailwind.css"; // Ensure styles are included

const DEFAULT_USER_ID = "demo-user";

export default function OverlayApp() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("step1"); // step1, step2, step3, step4
  const [docked, setDocked] = useState(false);
  const [workflow, setWorkflow] = useState(null);
  
  // Logic State
  const [focusMinutes, setFocusMinutes] = useState(20);
  const [checkInInterval, setCheckInInterval] = useState(5);
  
  // Feedback State
  const [rating, setRating] = useState(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [selectedReasons, setSelectedReasons] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Block tracking
  const hasActiveBlock = useRef(false);
  const feedbackShown = useRef(false);

  useEffect(() => {
    // Listen for messages from Background or Popup
    const handleChromeMsg = (msg, sender, sendResponse) => {
      if (!msg || typeof msg.type !== "string") return;

      if (msg.type === "SHOW_PLAN_OVERLAY") {
        setWorkflow(msg.workflow);
        if (msg.workflow?.block_minutes) setFocusMinutes(msg.workflow.block_minutes);
        setOpen(true);
        setView("step1");
        setDocked(false);
      }

      if (msg.type === "START_BLOCK") {
        hasActiveBlock.current = true;
        feedbackShown.current = false;
      }

      if (msg.type === "END_BLOCK" || msg.type === "SHOW_FEEDBACK_OVERLAY") {
        triggerFeedback();
      }
    };

    // Listen for messages from Local Page (Focus Games)
    const handleWindowMsg = (event) => {
      const data = event.data;
      if (!data || typeof data.type !== "string") return;

      if (data.type === "START_BLOCK_LOCAL_TRIGGER") {
        hasActiveBlock.current = true;
        feedbackShown.current = false;
      }

      if (data.type === "SHOW_FEEDBACK_TRIGGER") {
        triggerFeedback();
      }
    };

    chrome.runtime.onMessage.addListener(handleChromeMsg);
    window.addEventListener("message", handleWindowMsg);

    return () => {
      chrome.runtime.onMessage.removeListener(handleChromeMsg);
      window.removeEventListener("message", handleWindowMsg);
    };
  }, []);

  const triggerFeedback = () => {
    if (!hasActiveBlock.current) return; // Ignore stray signals
    if (feedbackShown.current) return; // Don't show twice
    
    feedbackShown.current = true;
    setOpen(true);
    setView("step4");
    setDocked(false);
    setRating(null);
    setFeedbackText("");
    setSelectedReasons(new Set());
  };

  const handleClose = () => setOpen(false);

  const startMainFocusMode = () => {
    const mins = parseInt(focusMinutes) || 20;
    const interval = parseInt(checkInInterval) || 0;
    
    const checkIns = [];
    if (interval > 0 && interval < mins) {
      for (let t = interval; t < mins; t += interval) {
        checkIns.push(`T+${t}`);
      }
    }

    hasActiveBlock.current = true;
    feedbackShown.current = false;

    // Notify background
    chrome.runtime.sendMessage({ type: "START_BLOCK", minutes: mins, checkIns });
    
    // Notify local scripts
    window.postMessage({
      type: "START_BLOCK_LOCAL_TRIGGER",
      minutes: mins,
      checkIns,
      autoSpotlight: true
    }, "*");

    setOpen(false);
  };

  const submitFeedback = () => {
    setSubmitting(true);
    chrome.runtime.sendMessage({
      type: "PROXY_FETCH",
      url: "http://localhost:8000/feedback",
      method: "POST",
      body: {
        user_id: DEFAULT_USER_ID,
        rating: rating || 0,
        comment: feedbackText,
        reasons: Array.from(selectedReasons)
      }
    }, () => {
      setSubmitting(false);
      setOpen(false);
    });
  };

  if (!open) return null;

  // Dynamic Class Construction
  const containerClass = docked
    ? "fixed top-[15%] right-5 w-[320px] animate-slide-in z-[2147483647]"
    : "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-[420px] z-[2147483647]";

  return (
    <>
      {/* Backdrop (only if not docked) */}
      {!docked && <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[2147483646]" />}

      <div className={`${containerClass} font-sans text-slate-100`}>
        <div className="glass-panel rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
          
          {/* --- STEP 1: PLAN --- */}
          {view === "step1" && (
            <>
              <Header title={workflow?.summary?.title || "Micro-Start"} onClose={handleClose} />
              <p className="text-sm text-slate-300 leading-relaxed">
                {workflow?.summary?.one_liner}
              </p>
              
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-3">
                <span className="text-lg">💡</span>
                <div className="text-xs text-amber-200/90">
                  AI suggestion: These steps are generated. Tweak them if they don't match perfectly.
                </div>
              </div>

              <ul className="bg-dark-950/50 rounded-lg p-3 pl-8 list-disc space-y-1 text-sm text-slate-300 border border-white/5">
                {(workflow?.key_points || []).slice(0, 3).map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>

              <div className="flex gap-3 mt-2">
                <Button variant="secondary" onClick={handleClose}>Cancel</Button>
                <Button variant="primary" onClick={() => setView("step2")}>OK, Next Step →</Button>
              </div>
            </>
          )}

          {/* --- STEP 2: ACTION --- */}
          {view === "step2" && (
            <>
              {docked ? (
                // Docked Mini View
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Step 2: Tiny Action</span>
                    <button onClick={handleClose} className="text-slate-400 hover:text-white">×</button>
                  </div>
                  <div className="my-1 font-semibold text-sm border-l-2 border-primary pl-2 text-slate-100">
                    {workflow?.micro_tasks?.[0] || "Read the first paragraph."}
                  </div>
                  <Button variant="primary" onClick={() => setView("step3")}>I did it! 🎉</Button>
                </>
              ) : (
                // Modal View
                <>
                  <Header title="Step 2: One Tiny Action" onClose={handleClose} />
                  <p className="text-sm text-slate-300">Don't do everything. Just do this one thing:</p>
                  
                  <div className="bg-dark-950 p-4 rounded-lg border-l-4 border-primary shadow-inner">
                    <strong className="text-base text-white">
                      {workflow?.micro_tasks?.[0] || "Read the first paragraph."}
                    </strong>
                  </div>
                  
                  <p className="text-xs text-slate-400 italic">
                    Click "Do this now" to shrink this window to the corner while you work.
                  </p>

                  <div className="flex gap-3 mt-2">
                    <Button variant="secondary" onClick={() => setView("step1")}>Back</Button>
                    <Button variant="primary" onClick={() => setDocked(true)}>
                      Do this now (Dock) ↘
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {/* --- STEP 3: FOCUS SETUP --- */}
          {view === "step3" && (
            <>
              <Header title="Step 3: Focus Mode" onClose={handleClose} />
              <p className="text-sm text-slate-300">Great! Now let's block distractions and keep going.</p>

              <div className="grid grid-cols-2 gap-4 bg-dark-950/50 p-3 rounded-lg border border-white/5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Focus Time (Min)</label>
                  <input 
                    type="number" 
                    value={focusMinutes}
                    onChange={(e) => setFocusMinutes(e.target.value)}
                    className="w-full bg-dark-900 border border-slate-700 rounded px-2 py-1 text-sm focus:border-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Check-In (Min)</label>
                  <input 
                    type="number" 
                    value={checkInInterval}
                    onChange={(e) => setCheckInInterval(e.target.value)}
                    className="w-full bg-dark-900 border border-slate-700 rounded px-2 py-1 text-sm focus:border-primary outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-2">
                <Button variant="secondary" onClick={() => setView("step2")}>Back</Button>
                <Button variant="primary" onClick={startMainFocusMode}>
                  🚀 Start Focus Shield
                </Button>
              </div>
            </>
          )}

          {/* --- STEP 4: FEEDBACK --- */}
          {view === "step4" && (
            <>
              <Header title="Session Feedback" onClose={handleClose} />
              <p className="text-center text-sm text-slate-300">Did this help you start?</p>

              <div className="flex justify-center gap-4 my-2">
                <RatingBtn label="Bad" icon="❌" active={rating === 1} onClick={() => setRating(1)} />
                <RatingBtn label="Meh" icon="😐" active={rating === 2} onClick={() => setRating(2)} />
                <RatingBtn label="Good" icon="✅" active={rating === 3} onClick={() => setRating(3)} />
              </div>

              <p className="text-xs font-bold text-slate-400 mt-2">What felt off? (Optional)</p>
              <div className="flex flex-wrap gap-2">
                {["Too much text", "Steps didn't match", "UI buggy", "Timer weird"].map(r => (
                  <Chip 
                    key={r} 
                    label={r} 
                    selected={selectedReasons.has(r)} 
                    onClick={() => {
                      const next = new Set(selectedReasons);
                      next.has(r) ? next.delete(r) : next.add(r);
                      setSelectedReasons(next);
                    }}
                  />
                ))}
              </div>

              <textarea 
                rows="2"
                placeholder="Any other thoughts?"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                className="w-full bg-dark-900 border border-slate-700 rounded p-2 text-sm mt-2 focus:border-primary outline-none"
              />

              <Button variant="primary" onClick={submitFeedback} disabled={submitting}>
                {submitting ? "Sending..." : "Submit Feedback"}
              </Button>
            </>
          )}

        </div>
      </div>
    </>
  );
}

// --- Micro-Components for Overlay ---

function Header({ title, onClose }) {
  return (
    <div className="flex justify-between items-start">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
    </div>
  );
}

function Button({ children, variant = "secondary", ...props }) {
  const base = "flex-1 py-2.5 rounded-lg font-semibold text-xs transition-all duration-200 active:scale-95 shadow-lg";
  const styles = variant === "primary" 
    ? "bg-primary text-white shadow-primary/20 hover:bg-blue-600 btn-glow"
    : "bg-dark-800 border border-slate-600 text-slate-300 hover:bg-dark-700 hover:border-slate-500";
  
  return <button className={`${base} ${styles}`} {...props}>{children}</button>;
}

function RatingBtn({ icon, label, active, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-all duration-200 ${active ? 'scale-110' : 'opacity-60 hover:opacity-100'}`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl border ${active ? 'bg-primary border-blue-400 shadow-glow-sm shadow-primary' : 'bg-dark-800 border-slate-600'}`}>
        {icon}
      </div>
      <span className={`text-[10px] font-medium ${active ? 'text-primary' : 'text-slate-500'}`}>{label}</span>
    </button>
  );
}

function Chip({ label, selected, onClick }) {
  return (
    <span 
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-[10px] cursor-pointer border transition-all ${
        selected 
          ? 'bg-primary text-white border-blue-400 shadow-glow-sm shadow-primary' 
          : 'bg-dark-800 text-slate-400 border-slate-600 hover:border-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </span>
  );
}
