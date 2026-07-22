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

  let isAnalyzing = false;

  // Set loading UI state
  function setLoading(isLoading) {
    isAnalyzing = isLoading;
    submitBtn.disabled = isLoading;
    if (isLoading) {
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

  // Filter valid task objects
  function filterValidTasks(tasks, listPrefix) {
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
        : `${listPrefix}-fallback-${index + 1}`;

      const priority = (typeof item.priority === 'string') ? item.priority : 'medium';
      const deadline = (typeof item.deadline === 'string' && item.deadline.trim()) ? item.deadline.trim() : null;

      validList.push({
        id,
        task: taskText,
        priority,
        deadline
      });
    });

    return validList;
  }

  // Dynamic list rendering function
  function renderTaskList(rawTasks, targetElement, countElement, emptyMessage, listPrefix) {
    targetElement.innerHTML = '';
    const validTasks = filterValidTasks(rawTasks, listPrefix);

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

      const li = document.createElement('li');
      li.setAttribute('data-task-id', taskId);
      li.className = 'group flex items-center justify-between gap-3 p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl transition-all duration-150 cursor-pointer select-none';

      li.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <button type="button" aria-label="Mark as completed" aria-checked="false" role="checkbox" class="check-toggle w-5 h-5 rounded-full border-2 border-slate-300 group-hover:border-slate-400 flex items-center justify-center text-transparent hover:text-slate-400 shrink-0 transition-colors">
            <svg class="w-3 h-3 fill-current" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/>
            </svg>
          </button>
          <span class="task-title text-sm text-slate-700 font-medium truncate">${escapeHtml(taskText)}</span>
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
        const isDone = checkBtn.getAttribute('aria-checked') === 'true';
        if (isDone) {
          checkBtn.setAttribute('aria-checked', 'false');
          checkBtn.classList.remove('bg-emerald-500', 'border-emerald-500', 'text-white');
          checkBtn.classList.add('border-slate-300', 'text-transparent');
          titleSpan.classList.remove('line-through', 'text-slate-400');
          titleSpan.classList.add('text-slate-700');
        } else {
          checkBtn.setAttribute('aria-checked', 'true');
          checkBtn.classList.add('bg-emerald-500', 'border-emerald-500', 'text-white');
          checkBtn.classList.remove('border-slate-300', 'text-transparent');
          titleSpan.classList.add('line-through', 'text-slate-400');
          titleSpan.classList.remove('text-slate-700');
        }
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

      const todayTasks = Array.isArray(data.today) ? data.today : [];
      const tomorrowTasks = Array.isArray(data.tomorrow) ? data.tomorrow : [];

      // Replace previous rendered task lists completely
      renderTaskList(todayTasks, todayList, todayCount, 'No tasks for today', 'today');
      renderTaskList(tomorrowTasks, tomorrowList, tomorrowCount, 'No tasks for tomorrow', 'tomorrow');

    } catch (err) {
      console.error('Error analyzing tasks:', err);
      showError(err.message || 'Unable to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  submitBtn.addEventListener('click', handleAnalyze);
});
