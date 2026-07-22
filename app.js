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

  // Set loading UI state
  function setLoading(isLoading) {
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
    }
  }

  // Return formatted priority badge (Red: High, Yellow: Medium, Green: Low)
  function getPriorityBadge(priority) {
    const p = (priority || 'low').toLowerCase();
    let classes = '';
    let label = '';

    switch (p) {
      case 'high':
        classes = 'bg-red-100 text-red-700 border-red-200';
        label = 'Високий';
        break;
      case 'medium':
        classes = 'bg-amber-100 text-amber-700 border-amber-200';
        label = 'Середній';
        break;
      case 'low':
      default:
        classes = 'bg-emerald-100 text-emerald-700 border-emerald-200';
        label = 'Низький';
        break;
    }

    return `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full border ${classes} shrink-0">${label}</span>`;
  }

  // Safely escape HTML to prevent XSS
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Dynamic list rendering function
  function renderTaskList(tasks, targetElement, countElement, emptyMessage) {
    targetElement.innerHTML = '';
    
    if (!Array.isArray(tasks) || tasks.length === 0) {
      countElement.textContent = '0';
      targetElement.innerHTML = `
        <li class="empty-state text-slate-400 text-xs text-center py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          ${emptyMessage}
        </li>
      `;
      return;
    }

    countElement.textContent = tasks.length.toString();

    tasks.forEach((item) => {
      const taskText = item?.task || '';
      const priority = item?.priority || 'low';

      const li = document.createElement('li');
      li.className = 'group flex items-center justify-between gap-3 p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl transition-all duration-150 cursor-pointer select-none';

      li.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <button type="button" aria-label="Відмітити виконаним" class="check-toggle w-5 h-5 rounded-full border-2 border-slate-300 group-hover:border-slate-400 flex items-center justify-center text-transparent hover:text-slate-400 shrink-0 transition-colors">
            <svg class="w-3 h-3 fill-current" viewBox="0 0 20 20">
              <path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/>
            </svg>
          </button>
          <span class="task-title text-sm text-slate-700 font-medium truncate">${escapeHtml(taskText)}</span>
        </div>
        ${getPriorityBadge(priority)}
      `;

      // Checkbox / row toggle logic for interactive task completion
      const checkBtn = li.querySelector('.check-toggle');
      const titleSpan = li.querySelector('.task-title');

      const toggleComplete = (e) => {
        e.stopPropagation();
        const isDone = checkBtn.classList.contains('bg-emerald-500');
        if (isDone) {
          checkBtn.classList.remove('bg-emerald-500', 'border-emerald-500', 'text-white');
          checkBtn.classList.add('border-slate-300', 'text-transparent');
          titleSpan.classList.remove('line-through', 'text-slate-400');
          titleSpan.classList.add('text-slate-700');
        } else {
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

  // Submit button click handler
  async function handleAnalyze() {
    showError(null);

    const rawText = rawTextInput.value.trim();
    if (!rawText) {
      showError('Будь ласка, введіть текст із завданнями для аналізу.');
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Помилка обробки запиту сервером.');
      }

      // Render tasks into "Сьогодні" and "Завтра"
      renderTaskList(data.today, todayList, todayCount, 'Немає завдань на сьогодні');
      renderTaskList(data.tomorrow, tomorrowList, tomorrowCount, 'Немає завдань на завтра');

    } catch (err) {
      console.error('Error analyzing tasks:', err);
      showError(err.message || 'Сталася помилка при з\'єднанні з сервером.');
    } finally {
      setLoading(false);
    }
  }

  submitBtn.addEventListener('click', handleAnalyze);
});
