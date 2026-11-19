const DEFAULT_STATE = {
  user: {
    loggedIn: true,
    name: "Jordan Davis",
    email: "jordan.davis@elevate-ielts.com",
    initials: "JD",
    targetBand: 7.5
  },
  stats: {
    streak: 18,
    studyHours: 24,
    testsDone: 12
  },
  skills: {
    listening: { band: 6.5, completed: 3, total: 5 },
    reading:   { band: 7.0, completed: 4, total: 5 },
    writing:   { band: 6.0, completed: 2, total: 5 },
    speaking:  { band: 6.5, completed: 3, total: 5 }
  },
  vocabulary: [
    { word: "biophilic", def: "Relating to an innate human affinity for the natural world.", example: "Biophilic architecture reduces office stress." },
    { word: "microgrid", def: "A localized group of electricity sources that can operate independently.", example: "Community microgrids maintain power during outages." }
  ],
  history: [
    { skill: "Reading", title: "Biophilic Architecture Passage", score: "Band 7.0", date: "Today" },
    { skill: "Listening", title: "Renewable Microgrids Lecture", score: "Band 6.5", date: "Yesterday" }
  ]
};

const DICTIONARY_HINTS = {
  biophilic: "Relating to a close connection between humans and nature.",
  incorporating: "Taking in or containing something as part of a whole.",
  fatigue: "Extreme tiredness resulting from mental or physical exertion.",
  reinforced: "Strengthened or supported with additional material.",
  budgets: "Estimates of income and expenditure for a set period.",
  urban: "In, relating to, or characteristic of a town or city."
};

let appState = loadState();
let authMode = "login";
let sessionTimerInterval = null;
let mockTimerInterval = null;
let audioSpeed = 1.0;

// Speech Recognition & Audio Recording variables
let mediaRecorder = null;
let audioChunks = [];
let recognition = null;
let liveTranscript = "";
let speakingStartTime = null;

function loadState() {
  const saved = localStorage.getItem("elevate_ielts_v2");
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { return structuredClone(DEFAULT_STATE); }
  }
  return structuredClone(DEFAULT_STATE);
}

function saveState() {
  localStorage.setItem("elevate_ielts_v2", JSON.stringify(appState));
  renderDashboard();
}

function getInitials(name) {
  return name.trim().split(/\s+/).map(p => p[0]).join("").toUpperCase().slice(0, 2) || "U";
}

function calculateOverallBand() {
  const s = appState.skills;
  const avg = (s.listening.band + s.reading.band + s.writing.band + s.speaking.band) / 4;
  return (Math.round(avg * 2) / 2).toFixed(1);
}

function renderDashboard() {
  const overall = parseFloat(calculateOverallBand());
  const target = parseFloat(appState.user.targetBand);

  document.getElementById("userAvatarBtn").textContent = appState.user.loggedIn ? appState.user.initials : "?";
  document.getElementById("currentBandDisplay").textContent = overall.toFixed(1);
  document.getElementById("targetBandDisplay").textContent = target.toFixed(1);

  const baseline = 4.0;
  let pct = Math.round(((overall - baseline) / (target - baseline)) * 100);
  pct = Math.max(10, Math.min(100, pct));
  document.getElementById("goalProgressBar").style.width = pct + "%";
  document.getElementById("goalPercentDisplay").textContent = `${pct}% of your goal`;

  document.getElementById("streakDisplay").textContent = appState.stats.streak;
  document.getElementById("studyTimeDisplay").textContent = appState.stats.studyHours + "h";
  document.getElementById("testsDoneDisplay").textContent = appState.stats.testsDone;
  document.getElementById("vocabBadge").textContent = appState.vocabulary.length;

  ["listening", "reading", "writing", "speaking"].forEach(skill => {
    const data = appState.skills[skill];
    document.getElementById(`band-${skill}`).textContent = `Band ${data.band.toFixed(1)}`;
    document.getElementById(`meta-${skill}`).textContent = `${data.completed}/${data.total} modules`;
  });

  // Render Progress Bars
  const barsContainer = document.getElementById("skillBarsContainer");
  barsContainer.innerHTML = ["listening", "reading", "writing", "speaking"].map(skill => {
    const data = appState.skills[skill];
    const widthPct = Math.round((data.band / 9.0) * 100);
    return `
      <div class="skill-bar-row">
        <div class="skill-bar-header">
          <span style="text-transform: capitalize;">${skill}</span>
          <span>Band ${data.band.toFixed(1)} / 9.0</span>
        </div>
        <div class="skill-bar-bg">
          <div class="skill-bar-fill" style="width: ${widthPct}%"></div>
        </div>
      </div>
    `;
  }).join("");

  // Render History
  document.getElementById("activityHistoryList").innerHTML = appState.history.map(item => `
    <div class="activity-item">
      <div>
        <strong>${item.skill}</strong>: ${item.title}
        <div class="muted-text">${item.date}</div>
      </div>
      <span class="skill-band-pill">${item.score}</span>
    </div>
  `).join("");

  // Render Vocabulary Deck
  const vocabContainer = document.getElementById("vocabListContainer");
  if (appState.vocabulary.length === 0) {
    vocabContainer.innerHTML = `<div class="white-card"><p class="muted-text">No saved words yet. Click any highlighted word during a Reading session to save it.</p></div>`;
  } else {
    vocabContainer.innerHTML = appState.vocabulary.map((v, idx) => `
      <div class="white-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <h3 style="margin:0; color:var(--purple-primary);">${v.word}</h3>
          <button class="close-btn" style="width:28px;height:28px;font-size:12px;" onclick="removeVocab(${idx})">✕</button>
        </div>
        <p style="font-size:14px; margin-bottom:8px;">${v.def}</p>
        <p class="muted-text" style="font-style:italic;">"${v.example}"</p>
      </div>
    `).join("");
  }
}

function removeVocab(index) {
  appState.vocabulary.splice(index, 1);
  saveState();
  showToast("Word removed from deck");
}

// NAVIGATION
function navigateTo(viewName) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${viewName}`).classList.add("active");
  document.querySelectorAll(".nav-link").forEach(link => {
    link.classList.toggle("active", link.dataset.nav === viewName);
  });
}

function continueLearning() {
  const skills = Object.entries(appState.skills).sort((a, b) => a[1].band - b[1].band);
  openPractice(skills[0][0]);
}

// TIMERS
function startTimer(seconds, displayId, intervalRefSetter, onExpire) {
  let remaining = seconds;
  const updateDisplay = () => {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const el = document.getElementById(displayId);
    if (el) el.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };
  updateDisplay();
  const id = setInterval(() => {
    remaining--;
    updateDisplay();
    if (remaining <= 0) {
      clearInterval(id);
      if (onExpire) onExpire();
    }
  }, 1000);
  intervalRefSetter(id);
}

// PRACTICE MODALS
function openPractice(skill) {
  clearInterval(sessionTimerInterval);
  const modal = document.getElementById("practiceModal");
  const titleEl = document.getElementById("practiceTitle");
  const tagEl = document.getElementById("practiceTag");
  const bodyEl = document.getElementById("practiceContent");

  tagEl.textContent = `${skill.toUpperCase()} SESSION`;
  modal.classList.add("open");

  const durations = { listening: 600, reading: 1200, writing: 2400, speaking: 300 };
  startTimer(durations[skill], "sessionTimerDisplay", id => sessionTimerInterval = id, () => {
    showToast("Time is up! Submit your work.");
  });

  if (skill === "listening") {
    titleEl.textContent = "Listening — Academic Lecture";
    bodyEl.innerHTML = `
      <div class="passage-box">
        <p style="margin-bottom: 12px;"><strong>Audio Player:</strong> Listen carefully to the lecture excerpt on renewable microgrids.</p>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <button class="btn-primary" onclick="playListeningAudio()">▶ Play Audio</button>
          <button class="btn-outline" onclick="toggleTranscript()">Show / Hide Transcript</button>
        </div>
        <div class="speed-controls">
          <span class="muted-text" style="align-self:center;">Speed:</span>
          <button class="speed-btn" onclick="setAudioSpeed(0.8, this)">0.8x</button>
          <button class="speed-btn active" onclick="setAudioSpeed(1.0, this)">1.0x</button>
          <button class="speed-btn" onclick="setAudioSpeed(1.25, this)">1.25x</button>
        </div>
        <div id="listeningTranscript" style="display:none; margin-top:14px; padding-top:12px; border-top:1px solid #DFDCE6; font-size:13px; color:var(--text-muted);">
          "Unlike traditional centralized power plants, community microgrids allow neighborhoods to generate and store their own solar electricity, maintaining local power supply even during main grid outages."
        </div>
      </div>
      <div class="question-block">
        <p>1. What is the main advantage of community microgrids mentioned by the speaker?</p>
        <label class="option-label"><input type="radio" name="lq1" value="a"> They completely eliminate solar panel installation costs</label>
        <label class="option-label"><input type="radio" name="lq1" value="b"> They maintain local power supply during main grid outages</label>
        <label class="option-label"><input type="radio" name="lq1" value="c"> They only operate during winter months</label>
      </div>
      <button class="btn-primary" onclick="submitSkillPractice('listening', document.querySelector('input[name=lq1]:checked')?.value === 'b')">Submit Answer</button>
    `;
  } else if (skill === "reading") {
    titleEl.textContent = "Reading — Interactive Vocabulary & Comprehension";
    const rawText = "Recent urban studies indicate that incorporating natural greenery into high-rise office buildings reduces employee mental fatigue by up to 22%. However, structural engineers note that biophilic rooftop forests require reinforced load-bearing columns, increasing initial construction budgets by roughly 8%.";
    const interactiveHtml = rawText.split(" ").map(token => {
      const clean = token.toLowerCase().replace(/[^a-z]/g, "");
      if (DICTIONARY_HINTS[clean]) {
        return `<span class="clickable-word" onclick="inspectWord('${clean}')">${token}</span>`;
      }
      return token;
    }).join(" ");

    bodyEl.innerHTML = `
      <div id="vocabInspector" class="vocab-popup-banner">
        <span>💡 <strong>Tip:</strong> Click any underlined word in the text below to see its meaning and save it to your Vocabulary deck.</span>
      </div>
      <div class="passage-box">
        <strong>Biophilic Architecture in Modern Cities</strong><br><br>
        ${interactiveHtml}
      </div>
      <div class="question-block">
        <p>Statement: Adding greenery to high-rise offices lowers initial construction costs.</p>
        <label class="option-label"><input type="radio" name="rq1" value="true"> TRUE</label>
        <label class="option-label"><input type="radio" name="rq1" value="false"> FALSE</label>
        <label class="option-label"><input type="radio" name="rq1" value="ng"> NOT GIVEN</label>
      </div>
      <button class="btn-primary" onclick="submitSkillPractice('reading', document.querySelector('input[name=rq1]:checked')?.value === 'false')">Check Answer</button>
    `;
  } else if (skill === "writing") {
    titleEl.textContent = "Writing — Task 2 Essay & AI Examiner";
    bodyEl.innerHTML = `
      <div class="passage-box">
        <strong>Prompt:</strong> Some people believe that international tourism brings economic benefits to local communities, while others argue it damages local culture and environments. Discuss both views and give your opinion.
      </div>
      <textarea id="writingInput" class="essay-area" placeholder="Write your academic essay here (try using linking words like 'However', 'Furthermore', 'In conclusion')..." oninput="updateWordCount()"></textarea>
      <div style="display:flex; justify-content:space-between; margin-bottom:14px; font-size:13px;">
        <span>Word count: <strong id="wordCountDisplay">0</strong> words</span>
        <span class="muted-text">Recommended: 150–250 words</span>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn-primary" onclick="evaluateEssayAI()">✨ Analyze with AI Examiner</button>
        <button id="saveWritingBtn" class="btn-outline" style="display:none;" onclick="completeEvaluatedWriting()">Save Band & Finish</button>
      </div>
      <div id="aiWritingResult"></div>
    `;
  } else if (skill === "speaking") {
    titleEl.textContent = "Speaking — Live Speech-to-Text & Fluency";
    liveTranscript = "";
    bodyEl.innerHTML = `
      <div class="passage-box">
        <strong>Part 2 Cue Card: Describe a skill you learned that helped you in your studies or work.</strong>
        <ul style="margin: 8px 0 0 20px; font-size:13.5px;">
          <li>What the skill is and when you learned it</li>
          <li>How you practiced it</li>
          <li>Why it was useful for your goals</li>
        </ul>
      </div>
      <div style="display:flex; gap:12px; align-items:center; margin-bottom:14px;">
        <button id="recordBtn" class="btn-primary" onclick="toggleRecording()">🎙 Start Speaking</button>
        <span id="recordStatus" class="muted-text">Click to record & transcribe your voice</span>
      </div>
      <div class="transcript-box" id="liveTranscriptBox">
        <span class="muted-text">Your live speech transcription will appear here as you speak...</span>
      </div>
      <audio id="playbackAudio" controls style="display:none; width:100%; margin-bottom:14px;"></audio>
      <div id="speakingAiFeedback"></div>
      <button class="btn-outline" onclick="submitSkillPractice('speaking', true)">Finish Speaking Session</button>
    `;
  }
}

function closePracticeModal() {
  clearInterval(sessionTimerInterval);
  window.speechSynthesis?.cancel();
  if (recognition) { try { recognition.stop(); } catch(e){} }
  document.getElementById("practiceModal").classList.remove("open");
}

// LISTENING HELPERS
function setAudioSpeed(rate, btn) {
  audioSpeed = rate;
  document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  showToast(`Playback speed set to ${rate}x`);
}

function toggleTranscript() {
  const el = document.getElementById("listeningTranscript");
  el.style.display = el.style.display === "none" ? "block" : "none";
}

function playListeningAudio() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(
      "Welcome to today's lecture on sustainable energy. Unlike traditional centralized power plants, community microgrids allow neighborhoods to generate and store their own solar electricity, maintaining local power supply even during main grid outages."
    );
    utter.lang = "en-US";
    utter.rate = audioSpeed;
    window.speechSynthesis.speak(utter);
    showToast(`Playing audio at ${audioSpeed}x speed...`);
  } else {
    showToast("Audio simulated: Microgrids maintain power during grid outages.");
  }
}

// READING VOCABULARY INSPECTOR
function inspectWord(word) {
  const def = DICTIONARY_HINTS[word] || "Academic vocabulary term.";
  const inspector = document.getElementById("vocabInspector");
  inspector.innerHTML = `
    <div>
      <strong style="text-transform:capitalize; color:var(--purple-primary);">${word}</strong>: ${def}
    </div>
    <button class="btn-primary" style="padding:7px 14px; font-size:12px;" onclick="saveWordToDeck('${word}', '${def.replace(/'/g, "\\'")}')">+ Save Word</button>
  `;
}

function saveWordToDeck(word, def) {
  if (!appState.vocabulary.some(v => v.word.toLowerCase() === word.toLowerCase())) {
    appState.vocabulary.unshift({
      word,
      def,
      example: "Saved from Biophilic Architecture reading passage."
    });
    saveState();
    showToast(`"${word}" added to your Vocabulary deck!`);
  } else {
    showToast(`"${word}" is already in your deck.`);
  }
}

// AI ESSAY EXAMINER
let lastEvaluatedWritingBand = 6.5;

function updateWordCount() {
  const text = document.getElementById("writingInput").value.trim();
  const count = text ? text.split(/\s+/).length : 0;
  document.getElementById("wordCountDisplay").textContent = count;
}

function evaluateEssayAI() {
  const text = document.getElementById("writingInput").value.trim();
  const words = text ? text.split(/\s+/) : [];
  if (words.length < 20) {
    showToast("Write at least 20 words for AI evaluation.");
    return;
  }

  const lower = text.toLowerCase();
  const connectors = ["however", "furthermore", "moreover", "therefore", "although", "consequently", "in conclusion", "on the other hand"];
  const usedConnectors = connectors.filter(c => lower.includes(c));
  const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, "")));
  const lexicalDiversity = uniqueWords.size / words.length;

  let taskScore = words.length >= 120 ? 7.5 : words.length >= 60 ? 6.5 : 6.0;
  let coherenceScore = usedConnectors.length >= 2 ? 7.5 : usedConnectors.length === 1 ? 6.5 : 6.0;
  let lexicalScore = lexicalDiversity > 0.65 ? 7.5 : 6.5;
  let grammarScore = text.includes(",") && text.includes(".") ? 7.0 : 6.0;

  const overall = (Math.round(((taskScore + coherenceScore + lexicalScore + grammarScore) / 4) * 2) / 2);
  lastEvaluatedWritingBand = overall;

  const tips = [];
  if (usedConnectors.length < 2) tips.push("Add cohesive linking devices such as <em>Furthermore</em>, <em>However</em>, or <em>Consequently</em>.");
  if (lower.includes("good") || lower.includes("bad") || lower.includes("big")) {
    tips.push("Upgrade informal adjectives: replace <em>good/bad/big</em> with <em>beneficial, detrimental, substantial</em>.");
  }
  if (words.length < 100) tips.push("Expand your body paragraphs with a concrete real-world example to boost Task Response.");
  if (tips.length === 0) tips.push("Strong academic register and cohesive paragraph flow!");

  document.getElementById("aiWritingResult").innerHTML = `
    <div class="ai-feedback-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>AI Examiner Assessment</strong>
        <span class="status-badge">Estimated Band ${overall.toFixed(1)}</span>
      </div>
      <div class="ai-criteria-grid">
        <div class="ai-criterion"><span>Task Response</span><span>${taskScore.toFixed(1)}</span></div>
        <div class="ai-criterion"><span>Coherence & Cohesion</span><span>${coherenceScore.toFixed(1)}</span></div>
        <div class="ai-criterion"><span>Lexical Resource</span><span>${lexicalScore.toFixed(1)}</span></div>
        <div class="ai-criterion"><span>Grammatical Range</span><span>${grammarScore.toFixed(1)}</span></div>
      </div>
      <div style="font-size:13px; color:var(--text-dark);">
        <strong>Actionable Improvements:</strong>
        <ul style="margin:6px 0 0 18px;">${tips.map(t => `<li>${t}</li>`).join("")}</ul>
      </div>
    </div>
  `;
  document.getElementById("saveWritingBtn").style.display = "inline-flex";
}

function completeEvaluatedWriting() {
  const s = appState.skills.writing;
  s.completed = Math.min(s.total, s.completed + 1);
  s.band = lastEvaluatedWritingBand;
  appState.stats.testsDone += 1;
  appState.stats.studyHours += 1;
  appState.history.unshift({
    skill: "Writing",
    title: "AI-Graded Task 2 Essay",
    score: `Band ${s.band.toFixed(1)}`,
    date: "Just now"
  });
  saveState();
  closePracticeModal();
  showToast(`Writing updated to Band ${s.band.toFixed(1)}!`);
}

// SPEAKING RECORDING + LIVE SPEECH-TO-TEXT
async function toggleRecording() {
  const btn = document.getElementById("recordBtn");
  const status = document.getElementById("recordStatus");
  const transcriptBox = document.getElementById("liveTranscriptBox");

  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    liveTranscript = "";
    speakingStartTime = Date.now();
    transcriptBox.innerHTML = `<span class="muted-text">Listening... speak clearly into your microphone.</span>`;

    // Start Web Speech API if supported
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = event => {
        let text = "";
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript + " ";
        }
        liveTranscript = text.trim();
        transcriptBox.textContent = liveTranscript || "Listening...";
      };
      try { recognition.start(); } catch (e) {}
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        const audioEl = document.getElementById("playbackAudio");
        audioEl.src = URL.createObjectURL(blob);
        audioEl.style.display = "block";
        analyzeSpeakingFluency();
      };
      mediaRecorder.start();
      btn.textContent = "⏹ Stop Recording";
      status.textContent = "Recording & transcribing...";
    } catch (err) {
      status.textContent = "Microphone access blocked — using sample transcript.";
      liveTranscript = "I learned data analysis using spreadsheets during my final university year, which helped me organize research efficiently.";
      transcriptBox.textContent = liveTranscript;
      analyzeSpeakingFluency();
    }
  } else {
    mediaRecorder.stop();
    if (recognition) { try { recognition.stop(); } catch (e) {} }
    btn.textContent = "🎙 Record Again";
    status.textContent = "Recording saved! Review your fluency analysis below.";
  }
}

function analyzeSpeakingFluency() {
  const durationSec = Math.max(5, Math.round((Date.now() - speakingStartTime) / 1000));
  const words = liveTranscript ? liveTranscript.split(/\s+/) : [];
  const wpm = Math.round((words.length / durationSec) * 60) || 115;
  const fillers = words.filter(w => ["um", "uh", "like", "basically"].includes(w.toLowerCase())).length;

  document.getElementById("speakingAiFeedback").innerHTML = `
    <div class="ai-feedback-card" style="margin-bottom:14px;">
      <strong>Fluency & Pronunciation Metrics</strong>
      <div class="ai-criteria-grid">
        <div class="ai-criterion"><span>Speaking Pace</span><span>${wpm} WPM</span></div>
        <div class="ai-criterion"><span>Filler Words</span><span>${fillers} detected</span></div>
      </div>
      <p style="font-size:13px;">${wpm >= 100 && wpm <= 155 ? "Ideal natural pace for IELTS Speaking (110–150 WPM)." : "Try maintaining a steady, calm pace around 120–140 words per minute."}</p>
    </div>
  `;
}

// FULL TIMED MOCK EXAM
let mockAnswers = {};

function openMockExam() {
  clearInterval(mockTimerInterval);
  mockAnswers = {};
  document.getElementById("mockModal").classList.add("open");
  startTimer(1500, "mockTimerDisplay", id => mockTimerInterval = id, () => {
    finishMockExam();
  });
  renderMockStep(1);
}

function closeMockModal() {
  clearInterval(mockTimerInterval);
  document.getElementById("mockModal").classList.remove("open");
}

function renderMockStep(step) {
  const title = document.getElementById("mockStageTitle");
  const body = document.getElementById("mockBody");

  if (step === 1) {
    title.textContent = "Mock Exam — Part 1 of 3: Listening";
    body.innerHTML = `
      <div class="passage-box">
        <p style="margin-bottom:10px;">Listen to the campus orientation announcement and answer below.</p>
        <button class="btn-primary" onclick="playListeningAudio()">▶ Play Exam Audio</button>
      </div>
      <div class="question-block">
        <p>Q1. Microgrids are primarily praised for:</p>
        <label class="option-label"><input type="radio" name="m_l" value="correct"> Keeping local power running during main grid failures</label>
        <label class="option-label"><input type="radio" name="m_l" value="wrong"> Replacing all wind turbines nationwide</label>
      </div>
      <button class="btn-primary" onclick="mockAnswers.l = document.querySelector('input[name=m_l]:checked')?.value === 'correct'; renderMockStep(2);">Next: Reading Section →</button>
    `;
  } else if (step === 2) {
    title.textContent = "Mock Exam — Part 2 of 3: Academic Reading";
    body.innerHTML = `
      <div class="passage-box">
        Vertical farming inside urban warehouses uses 95% less water than conventional agriculture through closed-loop hydroponics, though LED lighting remains its highest operational expense.
      </div>
      <div class="question-block">
        <p>Q2. What is the biggest ongoing cost for vertical farms?</p>
        <label class="option-label"><input type="radio" name="m_r" value="wrong"> Water supply</label>
        <label class="option-label"><input type="radio" name="m_r" value="correct"> LED lighting</label>
      </div>
      <button class="btn-primary" onclick="mockAnswers.r = document.querySelector('input[name=m_r]:checked')?.value === 'correct'; renderMockStep(3);">Next: Writing Task →</button>
    `;
  } else if (step === 3) {
    title.textContent = "Mock Exam — Part 3 of 3: Express Writing";
    body.innerHTML = `
      <div class="passage-box">
        <strong>Task:</strong> Write a short paragraph (at least 25 words) explaining whether public transport should be free in major cities.
      </div>
      <textarea id="mockWritingText" class="essay-area" placeholder="Type your exam response..."></textarea>
      <button class="btn-primary" onclick="finishMockExam()">Finish & Calculate Exam Band Score</button>
    `;
  }
}

function finishMockExam() {
  clearInterval(mockTimerInterval);
  const wText = document.getElementById("mockWritingText")?.value.trim() || "";
  const wCount = wText ? wText.split(/\s+/).length : 0;

  const lBand = mockAnswers.l ? 7.5 : 5.5;
  const rBand = mockAnswers.r ? 7.5 : 5.5;
  const wBand = wCount >= 25 ? 7.0 : 5.5;
  const examOverall = (Math.round(((lBand + rBand + wBand) / 3) * 2) / 2);

  appState.skills.listening.band = lBand;
  appState.skills.reading.band = rBand;
  appState.skills.writing.band = wBand;
  appState.stats.testsDone += 1;
  appState.stats.studyHours += 1;
  appState.history.unshift({
    skill: "Mock Exam",
    title: "Full Timed IELTS Simulation",
    score: `Band ${examOverall.toFixed(1)}`,
    date: "Just now"
  });
  saveState();

  document.getElementById("mockStageTitle").textContent = "Mock Exam Official Result";
  document.getElementById("mockBody").innerHTML = `
    <div style="text-align:center; padding: 16px 0;">
      <div class="eyebrow">OVERALL MOCK SCORE</div>
      <div style="font-size:64px; font-weight:800; color:var(--purple-primary); line-height:1.1; margin-bottom:14px;">${examOverall.toFixed(1)}</div>
      <div class="ai-criteria-grid" style="max-width:420px; margin: 0 auto 20px;">
        <div class="ai-criterion"><span>Listening</span><span>Band ${lBand.toFixed(1)}</span></div>
        <div class="ai-criterion"><span>Reading</span><span>Band ${rBand.toFixed(1)}</span></div>
        <div class="ai-criterion"><span>Writing</span><span>Band ${wBand.toFixed(1)}</span></div>
        <div class="ai-criterion"><span>Status</span><span>Updated on Dashboard</span></div>
      </div>
      <button class="btn-primary" onclick="closeMockModal()">Return to Dashboard</button>
    </div>
  `;
}

// STANDARD SKILL SUBMIT
function submitSkillPractice(skill, isCorrect) {
  if (!isCorrect) {
    showToast("Not quite — review the passage and try again!");
    return;
  }
  const s = appState.skills[skill];
  s.completed = Math.min(s.total, s.completed + 1);
  s.band = Math.min(9.0, +(s.band + 0.5).toFixed(1));
  appState.stats.testsDone += 1;
  appState.stats.studyHours += 1;
  appState.history.unshift({
    skill: skill.charAt(0).toUpperCase() + skill.slice(1),
    title: "Completed Timed Module",
    score: `Band ${s.band.toFixed(1)}`,
    date: "Just now"
  });
  saveState();
  closePracticeModal();
  showToast(`Great job! ${skill.toUpperCase()} improved to Band ${s.band.toFixed(1)}`);
}

// AUTH & PROFILE
document.getElementById("userAvatarBtn").addEventListener("click", openAuthModal);

function openAuthModal() {
  document.getElementById("authModal").classList.add("open");
  if (appState.user.loggedIn) {
    document.getElementById("profilePanel").style.display = "block";
    document.getElementById("authFormPanel").style.display = "none";
    document.getElementById("profileLargeAvatar").textContent = appState.user.initials;
    document.getElementById("profileNameDisplay").textContent = appState.user.name;
    document.getElementById("profileEmailDisplay").textContent = appState.user.email;
    document.getElementById("profileTargetSelect").value = appState.user.targetBand.toFixed(1);
  } else {
    switchAuthMode("login");
  }
}

function closeAuthModal() { document.getElementById("authModal").classList.remove("open"); }

function switchAuthMode(mode) {
  document.getElementById("profilePanel").style.display = "none";
  document.getElementById("authFormPanel").style.display = "block";
  setAuthTab(mode);
}

function setAuthTab(tab) {
  authMode = tab;
  document.getElementById("tabLogin").classList.toggle("active", tab === "login");
  document.getElementById("tabRegister").classList.toggle("active", tab === "register");
  document.getElementById("registerFields").style.display = tab === "register" ? "block" : "none";
  document.getElementById("authSubmitBtn").textContent = tab === "register" ? "Create Account" : "Sign In";
  document.getElementById("authError").textContent = "";
}

function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value.trim();
  const errorEl = document.getElementById("authError");

  if (!email || password.length < 4) {
    errorEl.textContent = "Please enter a valid email and password (min 4 characters).";
    return;
  }

  const usersDb = JSON.parse(localStorage.getItem("elevate_users_db") || "{}");

  if (authMode === "register") {
    const name = document.getElementById("regName").value.trim() || "Student";
    const startBand = parseFloat(document.getElementById("regCurrentBand").value);
    const targetBand = parseFloat(document.getElementById("regTargetBand").value);
    const newUser = { name, email, password, initials: getInitials(name), targetBand };

    usersDb[email] = newUser;
    localStorage.setItem("elevate_users_db", JSON.stringify(usersDb));

    appState.user = { ...newUser, loggedIn: true };
    appState.skills = {
      listening: { band: startBand, completed: 0, total: 5 },
      reading:   { band: startBand, completed: 0, total: 5 },
      writing:   { band: startBand, completed: 0, total: 5 },
      speaking:  { band: startBand, completed: 0, total: 5 }
    };
    appState.stats = { streak: 1, studyHours: 0, testsDone: 0 };
    appState.history = [{ skill: "Account", title: "Joined elevate IELTS", score: `Band ${startBand.toFixed(1)}`, date: "Just now" }];
    saveState();
    closeAuthModal();
    showToast(`Welcome to elevate, ${name}!`);
  } else {
    const existing = usersDb[email];
    if (existing && existing.password === password) {
      appState.user = { ...existing, loggedIn: true };
      saveState();
      closeAuthModal();
      showToast(`Welcome back, ${existing.name}!`);
    } else if (email === DEFAULT_STATE.user.email) {
      appState.user = { ...DEFAULT_STATE.user, loggedIn: true };
      saveState();
      closeAuthModal();
      showToast("Signed in as Jordan Davis");
    } else {
      errorEl.textContent = "Account not found or wrong password. Try creating a new account!";
    }
  }
}

function saveProfileChanges() {
  const newTarget = parseFloat(document.getElementById("profileTargetSelect").value);
  appState.user.targetBand = newTarget;
  saveState();
  closeAuthModal();
  showToast(`Target updated to Band ${newTarget.toFixed(1)}`);
}

function logoutUser() {
  appState.user.loggedIn = false;
  saveState();
  switchAuthMode("login");
  showToast("Logged out");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3200);
}

renderDashboard();