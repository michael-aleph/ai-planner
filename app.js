document.addEventListener('DOMContentLoaded', () => {
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const btnSpinner = document.getElementById('btnSpinner');
  const rawTextInput = document.getElementById('rawTextInput');
  const errorMessage = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');

  const todayList = document.getElementById('todayList');
  const tomorrowList = document.getElementById('tomorrowList');
  const todayCount = document.getElementById('todayCount');
  const tomorrowCount = document.getElementById('tomorrowCount');

  const voiceBtn = document.getElementById('voiceBtn');
  const voiceBtnText = document.getElementById('voiceBtnText');
  const voiceStatus = document.getElementById('voiceStatus');

  const aiSummaryCard = document.getElementById('aiSummaryCard');
  const aiSummaryText = document.getElementById('aiSummaryText');

  const planProgressCard = document.getElementById('planProgressCard');
  const progressText = document.getElementById('progressText');
  const progressBarFill = document.getElementById('progressBarFill');
  const clearPlanBtn = document.getElementById('clearPlanBtn');

  const PLAN_STORAGE_KEY = 'ai-planner.plan.v1';
  const PLAN_STORAGE_VERSION = 1;

  let isAnalyzing = false;

  // Empty plan factory
  function createEmptyPlan() {
    return {
      version: PLAN_STORAGE_VERSION,
      summary: '',
      today: [],
      tomorrow: []
    };
  }

  // Central client state
  let currentPlan = createEmptyPlan();

  // Web Speech API Feature Detection
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;
  let voiceStatusTimer = null;

  // Set voice status message
  function setVoiceStatus(msg, clearAfterMs = 0) {
    if (voiceStatusTimer) {
      clearTimeout(voiceStatusTimer);
      voiceStatusTimer = null;
    }

    if (msg) {
      voiceStatus.textContent = msg;
      voiceStatus.classList.remove('hidden');

      if (clearAfterMs > 0) {
        voiceStatusTimer = setTimeout(() => {
          voiceStatus.classList.add('hidden');
          voiceStatus.textContent = '';
          voiceStatusTimer = null;
        }, clearAfterMs);
      }
    } else {
      voiceStatus.classList.add('hidden');
      voiceStatus.textContent = '';
    }
  }

  // Initialize Speech Recognition instance if supported
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isListening = true;
      voiceBtn.setAttribute('aria-pressed', 'true');
      voiceBtn.setAttribute('aria-label', 'Stop voice input');
      voiceBtnText.textContent = 'Listening...';
      voiceBtn.classList.remove('bg-slate-100', 'text-slate-700', 'border-slate-200/80');
      voiceBtn.classList.add('bg-red-100', 'text-red-700', 'border-red-300', 'animate-pulse');
      setVoiceStatus('Listening...');
    };

    recognition.onresult = (event) => {
      const rawTranscript = event?.results?.[0]?.[0]?.transcript;
      if (typeof rawTranscript === 'string') {
        const transcript = rawTranscript.trim();
        if (transcript) {
          const current = rawTextInput.value.trim();
          if (current) {
            const lastChar = current.slice(-1);
            const separator = (['.', '!', '?'].includes(lastChar)) ? ' ' : '. ';
            rawTextInput.value = current + separator + transcript;
          } else {
            rawTextInput.value = transcript;
          }
          rawTextInput.focus();
          setVoiceStatus('Voice input added.', 4000);
        }
      }
    };

    recognition.onerror = (event) => {
      const errorType = event?.error;
      let msg = 'Voice recognition failed. Please try again or type your tasks.';

      switch (errorType) {
        case 'not-allowed':
        case 'service-not-allowed':
          msg = 'Microphone access was denied. Please allow access or type your tasks instead.';
          break;
        case 'no-speech':
          msg = 'No speech was detected. Please try again.';
          break;
        case 'audio-capture':
          msg = 'No microphone was found. Please check your device and try again.';
          break;
        case 'network':
          msg = 'Voice recognition could not connect. Please try again.';
          break;
        default:
          break;
      }

      setVoiceStatus(msg, 6000);
    };

    recognition.onend = () => {
      isListening = false;
      voiceBtn.setAttribute('aria-pressed', 'false');
      voiceBtn.setAttribute('aria-label', 'Start voice input');
      voiceBtnText.textContent = 'Speak';
      voiceBtn.classList.remove('bg-red-100', 'text-red-700', 'border-red-300', 'animate-pulse');
      voiceBtn.classList.add('bg-slate-100', 'text-slate-700', 'border-slate-200/80');
    };
  }

  // Microphone button click handler
  if (voiceBtn) {
    if (!SpeechRecognition) {
      voiceBtn.disabled = true;
      voiceBtn.title = 'Voice recognition is not supported in this browser.';
    } else {
      voiceBtn.addEventListener('click', () => {
        if (isAnalyzing) return;

        showError(null);

        if (isListening) {
          try {
            recognition.stop();
          } catch (e) {
            // Safe cleanup
          }
        } else {
          setVoiceStatus(null);
          try {
            recognition.start();
          } catch (err) {
            console.error('Error starting voice recognition:', err);
            setVoiceStatus('Voice recognition failed to start. Please try again.', 5000);
          }
        }
      });
    }
  }

  // Set loading UI state
  function setLoading(isLoading) {
    isAnalyzing = isLoading;
    submitBtn.disabled = isLoading;
    if (voiceBtn && SpeechRecognition) {
      voiceBtn.disabled = isLoading;
    }
    if (isLoading) {
      if (isListening && recognition) {
        try {
          recognition.stop();
        } catch (e) {
          // Safe stop
        }
      }
      btnText.classList.add('hidden');
      btnSpinner.classList.remove('hidden');
    } else {
      btnText.classList.remove('hidden');
      btnSpinner.classList.add('hidden');
    }
  }

  // Display or hide error message
  function showError(msg) {
    if (msg) {
      errorText.textContent = msg;
      errorMessage.classList.remove('hidden');
    } else {
      errorMessage.classList.add('hidden');
      errorText.textContent = '';
    }
  }

  // Render or hide AI Focus summary card
  function renderSummary(value) {
    if (!aiSummaryCard || !aiSummaryText) return;

    const summary = (typeof value === 'string') ? value.trim() : '';

    if (!summary) {
      aiSummaryText.textContent = '';
      aiSummaryCard.classList.add('hidden');
      return;
    }

    aiSummaryText.textContent = summary;
    aiSummaryCard.classList.remove('hidden');
  }

  // Derive progress metrics from plan state
  function getPlanProgress(plan) {
    const todayTasks = Array.isArray(plan?.today) ? plan.today : [];
    const tomorrowTasks = Array.isArray(plan?.tomorrow) ? plan.tomorrow : [];
    const tasks = [...todayTasks, ...tomorrowTasks];
    const total = tasks.length;
    const completed = tasks.filter(task => task && task.completed === true).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      percentage
    };
  }

  // Render progress UI and ARIA attributes
  function renderProgress(plan) {
    if (!planProgressCard || !progressText || !progressBarFill) return;

    const { total, completed, percentage } = getPlanProgress(plan);

    if (total === 0) {
      progressText.textContent = '0 of 0 tasks completed';
      progressBarFill.style.width = '0%';
      const progressTrack = progressBarFill.parentElement;
      if (progressTrack) progressTrack.setAttribute('aria-valuenow', '0');
      planProgressCard.classList.add('hidden');
      return;
    }

    const taskLabel = total === 1 ? 'task' : 'tasks';
    progressText.textContent = `${completed} of ${total} ${taskLabel} completed`;
    progressBarFill.style.width = `${percentage}%`;

    const progressTrack = progressBarFill.parentElement;
    if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(percentage));

    planProgressCard.classList.remove('hidden');
  }

  // Save current plan state to localStorage
  function savePlanToStorage(plan) {
    try {
      localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
    } catch (e) {
      // Catch quota or private browsing exceptions safely
    }
  }

  // Load and validate plan state from localStorage
  function loadPlanFromStorage() {
    try {
      const storedRaw = localStorage.getItem(PLAN_STORAGE_KEY);
      if (!storedRaw) return createEmptyPlan();

      const parsed = JSON.parse(storedRaw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        removePlanFromStorage();
        return createEmptyPlan();
      }

      if (parsed.version !== PLAN_STORAGE_VERSION) {
        removePlanFromStorage();
        return createEmptyPlan();
      }

      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 200) : '';
      const today = normalizeTaskList(parsed.today, 'today');
      const tomorrow = normalizeTaskList(parsed.tomorrow, 'tomorrow');

      return {
        version: PLAN_STORAGE_VERSION,
        summary,
        today,
        tomorrow
      };
    } catch (e) {
      removePlanFromStorage();
      return createEmptyPlan();
    }
  }

  // Safely remove plan key from localStorage
  function removePlanFromStorage() {
    try {
      localStorage.removeItem(PLAN_STORAGE_KEY);
    } catch (e) {
      // Catch storage removal exceptions
    }
  }

  // Clear plan action handler
  function clearPlan() {
    currentPlan = createEmptyPlan();
    removePlanFromStorage();
    showError(null);
    renderPlan(currentPlan);
  }

  if (clearPlanBtn) {
    clearPlanBtn.addEventListener('click', clearPlan);
  }

  // Render complete plan state (summary, progress, task lists)
  function renderPlan(plan) {
    renderSummary(plan.summary);
    renderProgress(plan);
    renderTaskList(plan.today, todayList, todayCount, 'No tasks for today', 'today');
    renderTaskList(plan.tomorrow, tomorrowList, tomorrowCount, 'No tasks for tomorrow', 'tomorrow');
  }

  // Return formatted priority badge (Red: High, Amber: Medium, Emerald: Low)
  function getPriorityBadge(priority) {
    const p = typeof priority === 'string' ? priority.trim().toLowerCase() : 'medium';
    let classes = '';
    let label = '';

    switch (p) {
      case 'high':
        classes = 'bg-red-100 text-red-700 border-red-200';
        label = 'High';
        break;
      case 'low':
        classes = 'bg-emerald-100 text-emerald-700 border-emerald-200';
        label = 'Low';
        break;
      case 'medium':
      default:
        classes = 'bg-amber-100 text-amber-700 border-amber-200';
        label = 'Medium';
        break;
    }

    return `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full border ${classes} shrink-0">${label}</span>`;
  }

  // Return formatted deadline badge if present
  function getDeadlineBadge(deadline) {
    if (typeof deadline !== 'string' || !deadline.trim()) {
      return '';
    }
    const text = escapeHtml(deadline.trim());
    return `
      <span class="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
        <svg class="w-3 h-3 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>${text}</span>
      </span>
    `;
  }

  // Safely escape HTML to prevent XSS
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Filter and normalize task objects from API or state
  function normalizeTaskList(tasks, listPrefix) {
    if (!Array.isArray(tasks)) {
      return [];
    }

    const validList = [];
    tasks.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return;
      }

      if (typeof item.task !== 'string') {
        return;
      }

      const taskText = item.task.trim();
      if (!taskText) {
        return;
      }

      const id = (typeof item.id === 'string' && item.id.trim())
        ? item.id.trim()
        : `${listPrefix}-${index + 1}`;

      const priority = (typeof item.priority === 'string') ? item.priority : 'medium';
      const deadline = (typeof item.deadline === 'string' && item.deadline.trim()) ? item.deadline.trim() : null;
      const completed = item.completed === true;

      validList.push({
        id,
        task: taskText,
        priority,
        deadline,
        completed
      });
    });

    return validList;
  }

  // Dynamic list rendering function
  function renderTaskList(rawTasks, targetElement, countElement, emptyMessage, listPrefix) {
    targetElement.innerHTML = '';
    const validTasks = normalizeTaskList(rawTasks, listPrefix);

    if (validTasks.length === 0) {
      countElement.textContent = '0';
      targetElement.innerHTML = `
        <li class="empty-state text-slate-400 text-xs text-center py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          ${escapeHtml(emptyMessage)}
        </li>
      `;
      return;
    }

    countElement.textContent = validTasks.length.toString();

    validTasks.forEach((item) => {
      const taskId = item.id;
      const taskText = item.task;
      const priority = item.priority;
      const deadline = item.deadline;
      const isCompleted = item.completed === true;

      const li = document.createElement('li');
      li.setAttribute('data-task-id', taskId);
      li.className = 'group flex items-center justify-between gap-3 p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl transition-all duration-150 cursor-pointer select-none';

      const checkClasses = isCompleted
        ? 'bg-emerald-500 border-emerald-500 text-white'
        : 'border-slate-300 text-transparent';

      const titleClasses = isCompleted
        ? 'line-through text-slate-400'
        : 'text-slate-700';

      li.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <button type="button" aria-label="Mark as completed" aria-checked="${isCompleted ? 'true' : 'false'}" role="checkbox" class="check-toggle w-5 h-5 rounded-full border-2 group-hover:border-slate-400 flex items-center justify-center shrink-0 transition-colors ${checkClasses}">
            <svg class="w-3 h-3 fill-current" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/>
            </svg>
          </button>
          <span class="task-title text-sm font-medium truncate ${titleClasses}">${escapeHtml(taskText)}</span>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          ${getDeadlineBadge(deadline)}
          ${getPriorityBadge(priority)}
        </div>
      `;

      // Checkbox / row toggle logic for interactive task completion
      const checkBtn = li.querySelector('.check-toggle');
      const titleSpan = li.querySelector('.task-title');

      const toggleComplete = (e) => {
        e.stopPropagation();
        const targetList = (listPrefix === 'today') ? currentPlan.today : currentPlan.tomorrow;
        const targetTask = Array.isArray(targetList) ? targetList.find(t => t.id === taskId) : null;

        const isDone = checkBtn.getAttribute('aria-checked') === 'true';
        if (isDone) {
          checkBtn.setAttribute('aria-checked', 'false');
          checkBtn.classList.remove('bg-emerald-500', 'border-emerald-500', 'text-white');
          checkBtn.classList.add('border-slate-300', 'text-transparent');
          titleSpan.classList.remove('line-through', 'text-slate-400');
          titleSpan.classList.add('text-slate-700');
          if (targetTask) targetTask.completed = false;
        } else {
          checkBtn.setAttribute('aria-checked', 'true');
          checkBtn.classList.add('bg-emerald-500', 'border-emerald-500', 'text-white');
          checkBtn.classList.remove('border-slate-300', 'text-transparent');
          titleSpan.classList.add('line-through', 'text-slate-400');
          titleSpan.classList.remove('text-slate-700');
          if (targetTask) targetTask.completed = true;
        }

        savePlanToStorage(currentPlan);
        renderProgress(currentPlan);
      };

      checkBtn.addEventListener('click', toggleComplete);
      li.addEventListener('click', (e) => {
        if (e.target !== checkBtn && !checkBtn.contains(e.target)) {
          toggleComplete(e);
        }
      });

      targetElement.appendChild(li);
    });
  }

  // Parse error message safely from server response
  function extractErrorMessage(data) {
    const fallbackMsg = 'Something went wrong while analyzing your tasks. Please try again.';
    if (!data) return fallbackMsg;

    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim();
    }

    if (typeof data.error === 'object' && data.error !== null) {
      if (typeof data.error.message === 'string' && data.error.message.trim()) {
        return data.error.message.trim();
      }
    }

    return fallbackMsg;
  }

  // Submit button click handler
  async function handleAnalyze() {
    if (isAnalyzing) return;

    showError(null);

    const rawText = rawTextInput.value.trim();
    if (!rawText) {
      showError('Please enter task text to analyze.');
      rawTextInput.focus();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: rawText }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch (jsonErr) {
        // Response was not JSON
      }

      if (!response.ok) {
        const errorMsg = extractErrorMessage(data);
        throw new Error(errorMsg);
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Received an unexpected response format from server.');
      }

      // Construct and replace plan state with new analysis result
      const newPlan = {
        version: PLAN_STORAGE_VERSION,
        summary: (typeof data.summary === 'string') ? data.summary.trim().slice(0, 200) : '',
        today: normalizeTaskList(data.today, 'today'),
        tomorrow: normalizeTaskList(data.tomorrow, 'tomorrow')
      };

      currentPlan = newPlan;
      savePlanToStorage(currentPlan);
      renderPlan(currentPlan);

    } catch (err) {
      console.error('Error analyzing tasks:', err);
      showError(err.message || 'Unable to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Restore and render saved plan on page load
  currentPlan = loadPlanFromStorage();
  renderPlan(currentPlan);

  submitBtn.addEventListener('click', handleAnalyze);
});
