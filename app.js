document.addEventListener('DOMContentLoaded', () => {
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const btnSpinner = document.getElementById('btnSpinner');
  const rawTextInput = document.getElementById('rawTextInput');
  const errorMessage = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');

  const todayList = document.getElementById('todayList');
  const tomorrowList = document.getElementById('tomorrowList');
  const laterList = document.getElementById('laterList');
  const todayCount = document.getElementById('todayCount');
  const tomorrowCount = document.getElementById('tomorrowCount');
  const laterCount = document.getElementById('laterCount');

  const voiceBtn = document.getElementById('voiceBtn');
  const voiceBtnText = document.getElementById('voiceBtnText');
  const voiceStatus = document.getElementById('voiceStatus');

  const aiSummaryCard = document.getElementById('aiSummaryCard');
  const aiSummaryText = document.getElementById('aiSummaryText');

  const planProgressCard = document.getElementById('planProgressCard');
  const progressText = document.getElementById('progressText');
  const progressBarFill = document.getElementById('progressBarFill');
  const clearPlanBtn = document.getElementById('clearPlanBtn');

  const PLAN_STORAGE_KEY = 'ai-planner.plan.v2';
  const LEGACY_PLAN_STORAGE_KEY = 'ai-planner.plan.v1';
  const PLAN_STORAGE_VERSION = 2;

  let isAnalyzing = false;

  // Bounded auto-growing height calculation for rawTextInput
  function adjustTextareaHeight() {
    if (!rawTextInput) return;

    const minHeight = 112;
    const maxHeight = 240;

    rawTextInput.style.height = 'auto';

    const contentHeight = rawTextInput.scrollHeight;
    const nextHeight = Math.min(
      Math.max(contentHeight, minHeight),
      maxHeight
    );

    rawTextInput.style.height = `${nextHeight}px`;
    rawTextInput.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
  }

  if (rawTextInput) {
    rawTextInput.addEventListener('input', adjustTextareaHeight);
  }

  // Empty plan factory
  function createEmptyPlan() {
    return {
      version: PLAN_STORAGE_VERSION,
      summary: '',
      today: [],
      tomorrow: [],
      later: []
    };
  }

  // Central client state
  let currentPlan = createEmptyPlan();

  // Single source of truth for active inline form (editing or manual creation)
  let activeFormState = null;

  function findTaskAndList(taskId) {
    if (!taskId || typeof taskId !== 'string') return { task: null, list: null, section: null, index: -1 };
    const sections = ['today', 'tomorrow', 'later'];
    for (const section of sections) {
      const list = Array.isArray(currentPlan[section]) ? currentPlan[section] : [];
      const idx = list.findIndex(t => t && t.id === taskId);
      if (idx !== -1) {
        return { task: list[idx], list, section, index: idx };
      }
    }
    return { task: null, list: null, section: null, index: -1 };
  }

  function findTaskInSection(section, taskId) {
    const allowedSections = ['today', 'tomorrow', 'later'];
    if (!allowedSections.includes(section) || !taskId || typeof taskId !== 'string') {
      return { task: null, list: null, index: -1 };
    }
    const list = Array.isArray(currentPlan[section]) ? currentPlan[section] : [];
    const idx = list.findIndex(t => t && t.id === taskId);
    if (idx !== -1) {
      return { task: list[idx], list, index: idx };
    }
    return { task: null, list, index: -1 };
  }

  function generateManualTaskId(targetSection) {
    const prefix = ['today', 'tomorrow', 'later'].includes(targetSection) ? targetSection : 'today';
    let candidate = '';
    let attempts = 0;
    while (attempts < 100) {
      attempts++;
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        candidate = `manual-${crypto.randomUUID()}`;
      } else {
        const rand = Math.random().toString(36).slice(2, 8);
        candidate = `manual-${Date.now().toString(36)}-${rand}`;
      }
      const { task } = findTaskAndList(candidate);
      if (!task) return candidate;
    }
    return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function closeActiveEditor() {
    if (!activeFormState) return;
    activeFormState = null;
    renderPlan(currentPlan);
  }

  function openInlineEditor(taskId, defaultSection) {
    const { task, section: currentSection } = findTaskAndList(taskId);
    if (!task) return;

    activeFormState = {
      type: 'edit',
      taskId: task.id,
      section: currentSection || defaultSection
    };

    renderPlan(currentPlan);
  }

  function openAddForm(section) {
    const allowedSections = ['today', 'tomorrow', 'later'];
    const targetSection = allowedSections.includes(section) ? section : 'today';

    activeFormState = {
      type: 'add',
      section: targetSection
    };

    renderPlan(currentPlan);
  }

  function buildTaskFormMarkup({ taskName = '', priority = 'medium', deadline = '', section = 'today', isEdit = true }) {
    const safeName = escapeHtml(taskName);
    const safeDeadline = escapeHtml(deadline || '');

    const deleteBtnMarkup = isEdit
      ? `<button
            type="button"
            class="delete-editor-btn py-1.5 px-3 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors mr-auto"
          >
            Delete
          </button>`
      : '';

    return `
      <form class="task-editor-form flex flex-col gap-3 p-3.5 bg-slate-50 border border-todoist-accent/40 rounded-xl shadow-xs transition-all">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Task name</label>
          <input
            type="text"
            name="taskName"
            value="${safeName}"
            required
            class="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-todoist-accent/20 focus:border-todoist-accent"
            placeholder="Enter task description"
          />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Section</label>
            <select
              name="section"
              class="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-todoist-accent/20 focus:border-todoist-accent"
            >
              <option value="today" ${section === 'today' ? 'selected' : ''}>Today</option>
              <option value="tomorrow" ${section === 'tomorrow' ? 'selected' : ''}>Tomorrow</option>
              <option value="later" ${section === 'later' ? 'selected' : ''}>Later</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
            <select
              name="priority"
              class="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-todoist-accent/20 focus:border-todoist-accent"
            >
              <option value="high" ${priority === 'high' ? 'selected' : ''}>High</option>
              <option value="medium" ${priority === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="low" ${priority === 'low' ? 'selected' : ''}>Low</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Deadline (optional)</label>
            <input
              type="text"
              name="deadline"
              value="${safeDeadline}"
              placeholder="e.g. 2:00 PM"
              class="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-todoist-accent/20 focus:border-todoist-accent"
            />
          </div>
        </div>
        <div class="editor-error hidden text-xs font-medium text-red-600 bg-red-50 p-2 rounded-lg border border-red-100" role="alert"></div>
        <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
          ${deleteBtnMarkup}
          <button
            type="button"
            class="cancel-editor-btn py-1.5 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="save-editor-btn py-1.5 px-3 rounded-lg bg-todoist-red hover:bg-todoist-hover text-xs font-semibold text-white shadow-xs transition-colors"
          >
            ${isEdit ? 'Save changes' : 'Add task'}
          </button>
        </div>
      </form>
    `;
  }

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
          adjustTextareaHeight();
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
    const laterTasks = Array.isArray(plan?.later) ? plan.later : [];
    const tasks = [...todayTasks, ...tomorrowTasks, ...laterTasks];
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
      return true;
    } catch (e) {
      // Catch quota or private browsing exceptions safely
      return false;
    }
  }

  // Load and validate plan state from localStorage
  function loadPlanFromStorage() {
    // Try loading v2 first
    try {
      const v2Raw = localStorage.getItem(PLAN_STORAGE_KEY);
      if (v2Raw) {
        const parsed = JSON.parse(v2Raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.version === PLAN_STORAGE_VERSION) {
          return {
            version: PLAN_STORAGE_VERSION,
            summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 200) : '',
            today: normalizeTaskList(parsed.today, 'today'),
            tomorrow: normalizeTaskList(parsed.tomorrow, 'tomorrow'),
            later: normalizeTaskList(parsed.later, 'later')
          };
        }
      }
    } catch (e) {
      // v2 parse failed, fall through to v1 migration
    }

    // Try migrating v1
    try {
      const v1Raw = localStorage.getItem(LEGACY_PLAN_STORAGE_KEY);
      if (v1Raw) {
        const parsed = JSON.parse(v1Raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.version === 1) {
          const migrated = {
            version: PLAN_STORAGE_VERSION,
            summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 200) : '',
            today: normalizeTaskList(parsed.today, 'today'),
            tomorrow: normalizeTaskList(parsed.tomorrow, 'tomorrow'),
            later: []
          };

          // Save migrated plan; remove v1 only on success
          if (savePlanToStorage(migrated)) {
            try {
              localStorage.removeItem(LEGACY_PLAN_STORAGE_KEY);
            } catch (e) {
              // v1 removal failed; safe to leave behind
            }
          }

          return migrated;
        }
      }
    } catch (e) {
      // v1 parse failed, fall through to empty plan
    }

    return createEmptyPlan();
  }

  // Safely remove application-owned plan keys from localStorage
  function removePlanFromStorage() {
    try {
      localStorage.removeItem(PLAN_STORAGE_KEY);
    } catch (e) {
      // Catch storage removal exceptions
    }
    try {
      localStorage.removeItem(LEGACY_PLAN_STORAGE_KEY);
    } catch (e) {
      // Catch legacy key removal exceptions
    }
  }

  // Clear plan action handler
  function clearPlan() {
    activeFormState = null;
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
    renderTaskList(plan.later, laterList, laterCount, 'No tasks planned for later', 'later');
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

    // Render + Add task button in section card header
    const sectionHeader = targetElement.previousElementSibling;
    if (sectionHeader && sectionHeader.classList.contains('flex')) {
      let addBtn = sectionHeader.querySelector('.add-task-btn');
      if (!addBtn) {
        addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'add-task-btn text-xs font-semibold text-todoist-red hover:text-todoist-hover flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-todoist-light transition-colors shrink-0';
        addBtn.setAttribute('aria-label', `Add task to ${listPrefix}`);
        addBtn.innerHTML = `
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>Add task</span>
        `;
        // Insert right before the count badge
        sectionHeader.appendChild(addBtn);
      }

      // Re-bind click listener cleanly
      addBtn.onclick = (e) => {
        e.stopPropagation();
        openAddForm(listPrefix);
      };
    }

    if (validTasks.length === 0) {
      countElement.textContent = '0';
      if (activeFormState && activeFormState.type === 'add' && activeFormState.section === listPrefix) {
        // Render Add form inside empty section
        renderAddFormInline(targetElement, listPrefix);
      } else {
        targetElement.innerHTML = `
          <li class="empty-state text-slate-400 text-xs text-center py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            ${escapeHtml(emptyMessage)}
          </li>
        `;
      }
      return;
    }

    countElement.textContent = validTasks.length.toString();

    validTasks.forEach((item) => {
      const taskId = item.id;
      const taskText = item.task;
      const priority = item.priority;
      const deadline = item.deadline;
      const isCompleted = item.completed === true;

      // Check if this task is currently being edited
      if (activeFormState && activeFormState.type === 'edit' && activeFormState.taskId === taskId) {
        const li = document.createElement('li');
        li.className = 'w-full list-none';
        li.innerHTML = buildTaskFormMarkup({
          taskName: taskText,
          priority: priority,
          deadline: deadline || '',
          section: listPrefix,
          isEdit: true
        });

        const form = li.querySelector('.task-editor-form');
        const nameInput = form.querySelector('[name="taskName"]');
        const sectionSelect = form.querySelector('[name="section"]');
        const prioritySelect = form.querySelector('[name="priority"]');
        const deadlineInput = form.querySelector('[name="deadline"]');
        const deleteBtn = form.querySelector('.delete-editor-btn');
        const cancelBtn = form.querySelector('.cancel-editor-btn');
        const errorDiv = form.querySelector('.editor-error');

        if (deleteBtn) {
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const { task: targetTask, list: targetList, index: targetIdx } = findTaskInSection(activeFormState.section || listPrefix, taskId);
            if (!targetTask || targetIdx === -1 || !Array.isArray(targetList)) {
              closeActiveEditor();
              return;
            }

            targetList.splice(targetIdx, 1);
            currentPlan.summary = '';
            savePlanToStorage(currentPlan);
            activeFormState = null;
            renderPlan(currentPlan);
          });
        }

        cancelBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeActiveEditor();
        });

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const newName = nameInput.value.trim();
          if (!newName) {
            errorDiv.textContent = 'Please enter a valid task name.';
            errorDiv.classList.remove('hidden');
            nameInput.focus();
            return;
          }

          const rawSection = sectionSelect.value;
          const allowedSections = ['today', 'tomorrow', 'later'];
          const targetSection = allowedSections.includes(rawSection) ? rawSection : listPrefix;

          const rawPriority = prioritySelect.value;
          const allowedPriorities = ['high', 'medium', 'low'];
          const targetPriority = allowedPriorities.includes(rawPriority) ? rawPriority : 'medium';

          const rawDeadline = deadlineInput.value.trim();
          const targetDeadline = rawDeadline.length > 0 ? rawDeadline : null;

          // Perform state mutation using section-aware lookup
          const editSection = activeFormState.section || listPrefix;
          const { task: sourceTask, list: sourceList, index: sourceIdx } = findTaskInSection(editSection, taskId);
          if (!sourceTask || sourceIdx === -1) {
            closeActiveEditor();
            return;
          }

          if (targetSection === editSection) {
            // Same section edit in place
            sourceTask.task = newName;
            sourceTask.priority = targetPriority;
            sourceTask.deadline = targetDeadline;
          } else {
            // Move across sections
            if (Array.isArray(sourceList)) {
              sourceList.splice(sourceIdx, 1);
            }

            const updatedTask = {
              id: sourceTask.id,
              task: newName,
              priority: targetPriority,
              deadline: targetDeadline,
              completed: sourceTask.completed === true
            };

            if (!Array.isArray(currentPlan[targetSection])) {
              currentPlan[targetSection] = [];
            }
            currentPlan[targetSection].push(updatedTask);
          }

          // Clear AI Focus on successful save
          currentPlan.summary = '';

          savePlanToStorage(currentPlan);
          activeFormState = null;
          renderPlan(currentPlan);
        });

        targetElement.appendChild(li);
        setTimeout(() => nameInput.focus(), 0);
        return;
      }

      const li = document.createElement('li');
      li.setAttribute('data-task-id', taskId);
      li.className = 'group flex items-center justify-between gap-3 p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl transition-all duration-150 cursor-pointer select-none';

      const checkClasses = isCompleted
        ? 'bg-emerald-500 border-emerald-500 text-white'
        : 'border-slate-300 text-transparent';

      const titleClasses = isCompleted
        ? 'line-through text-slate-400'
        : 'text-slate-700';

      const editClasses = isCompleted
        ? 'text-slate-300 hover:text-slate-500'
        : 'text-slate-400 hover:text-slate-600';

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
          <button type="button" aria-label="Edit task ${escapeHtml(taskText)}" class="edit-btn text-xs font-semibold p-1 rounded hover:bg-slate-200/60 transition-colors ${editClasses}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>
      `;

      // Checkbox / row toggle logic for interactive task completion
      const checkBtn = li.querySelector('.check-toggle');
      const titleSpan = li.querySelector('.task-title');
      const editBtn = li.querySelector('.edit-btn');

      const toggleComplete = (e) => {
        e.stopPropagation();
        const { list: targetList } = findTaskAndList(taskId);
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

      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openInlineEditor(taskId, listPrefix);
      });

      li.addEventListener('click', (e) => {
        if (e.target !== checkBtn && !checkBtn.contains(e.target) && e.target !== editBtn && !editBtn.contains(e.target)) {
          toggleComplete(e);
        }
      });

      targetElement.appendChild(li);
    });

    // If active form is Add mode for this section, append Add form to end of list
    if (activeFormState && activeFormState.type === 'add' && activeFormState.section === listPrefix) {
      renderAddFormInline(targetElement, listPrefix);
    }
  }

  // Helper to render inline Add form in a section element
  function renderAddFormInline(targetElement, sectionPrefix) {
    const li = document.createElement('li');
    li.className = 'w-full list-none mt-2';
    li.innerHTML = buildTaskFormMarkup({
      taskName: '',
      priority: 'medium',
      deadline: '',
      section: sectionPrefix,
      isEdit: false
    });

    const form = li.querySelector('.task-editor-form');
    const nameInput = form.querySelector('[name="taskName"]');
    const sectionSelect = form.querySelector('[name="section"]');
    const prioritySelect = form.querySelector('[name="priority"]');
    const deadlineInput = form.querySelector('[name="deadline"]');
    const cancelBtn = form.querySelector('.cancel-editor-btn');
    const errorDiv = form.querySelector('.editor-error');

    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeActiveEditor();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const newName = nameInput.value.trim();
      if (!newName) {
        errorDiv.textContent = 'Please enter a valid task name.';
        errorDiv.classList.remove('hidden');
        nameInput.focus();
        return;
      }

      const rawSection = sectionSelect.value;
      const allowedSections = ['today', 'tomorrow', 'later'];
      const targetSection = allowedSections.includes(rawSection) ? rawSection : sectionPrefix;

      const rawPriority = prioritySelect.value;
      const allowedPriorities = ['high', 'medium', 'low'];
      const targetPriority = allowedPriorities.includes(rawPriority) ? rawPriority : 'medium';

      const rawDeadline = deadlineInput.value.trim();
      const targetDeadline = rawDeadline.length > 0 ? rawDeadline : null;

      const newId = generateManualTaskId(targetSection);
      const newTask = {
        id: newId,
        task: newName,
        priority: targetPriority,
        deadline: targetDeadline,
        completed: false
      };

      if (!Array.isArray(currentPlan[targetSection])) {
        currentPlan[targetSection] = [];
      }
      currentPlan[targetSection].push(newTask);

      // Clear AI Focus on successful manual creation
      currentPlan.summary = '';

      savePlanToStorage(currentPlan);
      activeFormState = null;
      renderPlan(currentPlan);
    });

    targetElement.appendChild(li);
    setTimeout(() => nameInput.focus(), 0);
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
        tomorrow: normalizeTaskList(data.tomorrow, 'tomorrow'),
        later: normalizeTaskList(data.later, 'later')
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
  adjustTextareaHeight();

  submitBtn.addEventListener('click', handleAnalyze);
});
