export default async function handler(req, res) {
  // Method validation
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only POST requests are supported.'
      }
    });
  }

  try {
    // Parse request body
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        // Fallback if req.body is a raw JSON string
      }
    }

    const rawText = body?.text;
    if (typeof rawText !== 'string') {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Please provide valid task text to analyze.'
        }
      });
    }

    const text = rawText.trim();
    if (!text || text.length > 2000) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Please provide valid task text to analyze.'
        }
      });
    }

    // Verify API key configuration
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: {
          code: 'SERVER_CONFIGURATION_ERROR',
          message: 'The service is temporarily unavailable.'
        }
      });
    }

    const systemInstructionText = `You are an AI task planner assistant. Analyze the provided text and produce a structured plan.

## Task decomposition
Split the input into individual tasks using these conservative rules:
- Split distinct assignments, deliverables, communications, tests, reports, or independent actions.
- Split coordinated school subjects when each subject represents separate homework or a separate test (e.g. "homework for history and chemistry" becomes two tasks: "History homework" and "Chemistry homework").
- Do NOT split simple item lists within one shopping, packing, or collection action (e.g. "Buy bread and milk" stays one task).
- Do NOT split actions whose meaning depends on the objects remaining together (e.g. "Compare history and chemistry curricula" stays one task).
- Do NOT split sequential steps that form one deliverable unless the user clearly describes them as independently actionable tasks (e.g. "Review and submit the report" stays one task).
- Do NOT blindly split on "and", commas, or "&".
- Do NOT invent tasks not present in the input.

## Task fields
For each task, extract:
1. "task": clean, concise action text. Remove date/time phrases when represented by the bucket or deadline field.
2. "priority": exactly one of "high", "medium", or "low" (see priority rules below).
3. "deadline": a concise time or period string grounded in the user's wording (e.g. "2:00 PM", "6:00 PM", "Overdue", "Before next week"), or null if no deadline exists. Do not invent dates or times.

## Scheduling buckets
Classify every task into exactly one bucket:
- "today": explicitly today; due today; overdue; explicitly urgent without a future date; a specific time with no future-day wording (e.g. "at 2 PM"); tasks with no timing information (default); immediate actions.
- "tomorrow": explicitly tomorrow; due tomorrow; closing tomorrow; a time attached to tomorrow.
- "later": after tomorrow; next week; before next week when not due today or tomorrow; in several days; this weekend (when after tomorrow); a future named day beyond tomorrow; someday; non-immediate future work. Do NOT put a clearly future task in today merely because the exact calendar date is absent.

## Priority rules
Bucket and priority are independent decisions.
- "high": overdue; explicitly urgent; immediately; ASAP; critical; due today at a specific time; wording that clearly indicates immediate consequence. Not every today task is automatically high.
- "medium": normal today tasks without explicit urgency; normal tomorrow tasks; tomorrow tasks with a closing time unless explicitly urgent; near-term but non-immediate deadlines. Default priority.
- "low": normal later tasks; next-week tasks without explicit urgency; someday or optional future work; distant tasks with no immediate consequence.
Do not invent urgency.

## Summary (AI Focus)
Provide a "summary" string: exactly one concise sentence (maximum 200 characters) identifying what the user should focus on first.
Prioritize by: (1) overdue tasks, (2) explicitly urgent tasks, (3) today tasks with fixed times, (4) remaining high-priority today tasks, (5) remaining today work, (6) tomorrow tasks when useful.
Omit distant low-priority later tasks when urgent or today work exists.
Do not invent urgency or deadlines. Do not mention every task merely to be comprehensive. Use neutral, actionable wording without motivational filler. Return an empty string if no clear focus can be formed.

Return ONLY a single valid JSON object without markdown formatting, code fences, or additional text.
Response structure:
{
  "summary": "one concise sentence or empty string",
  "today": [
    { "task": "text", "priority": "high/medium/low", "deadline": "string or null" }
  ],
  "tomorrow": [
    { "task": "text", "priority": "high/medium/low", "deadline": "string or null" }
  ],
  "later": [
    { "task": "text", "priority": "high/medium/low", "deadline": "string or null" }
  ]
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    // 8-second request timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let response;
    try {
      response = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: text }]
            }
          ],
          systemInstruction: {
            parts: [{ text: systemInstructionText }]
          },
          generationConfig: {
            responseMimeType: 'application/json'
          }
        }),
        signal: controller.signal
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return res.status(504).json({
          error: {
            code: 'GEMINI_TIMEOUT',
            message: 'The analysis took too long. Please try again.'
          }
        });
      }
      throw fetchError;
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Gemini upstream request failed', {
        status: response.status,
        code: 'UPSTREAM_ERROR'
      });
      return res.status(502).json({
        error: {
          code: 'UPSTREAM_ERROR',
          message: 'The task analysis service is temporarily unavailable.'
        }
      });
    }

    const data = await response.json();
    const rawCandidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof rawCandidateText !== 'string' || !rawCandidateText.trim()) {
      return res.status(502).json({
        error: {
          code: 'AI_RESPONSE_ERROR',
          message: 'The task analysis service returned an invalid response.'
        }
      });
    }

    // Strip markdown code fences if present
    const cleanedText = rawCandidateText
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsedResult;
    try {
      parsedResult = JSON.parse(cleanedText);
    } catch (parseError) {
      return res.status(502).json({
        error: {
          code: 'AI_RESPONSE_ERROR',
          message: 'The task analysis service returned an invalid response.'
        }
      });
    }

    if (!parsedResult || typeof parsedResult !== 'object' || Array.isArray(parsedResult)) {
      return res.status(502).json({
        error: {
          code: 'AI_RESPONSE_ERROR',
          message: 'The task analysis service returned an invalid response.'
        }
      });
    }

    // Normalize summary, task lists, and generate deterministic IDs
    const formattedResult = {
      summary: normalizeSummary(parsedResult.summary),
      today: normalizeTaskList(parsedResult.today, 'today'),
      tomorrow: normalizeTaskList(parsedResult.tomorrow, 'tomorrow'),
      later: normalizeTaskList(parsedResult.later, 'later')
    };

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(formattedResult);
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred.'
      }
    });
  }
}

/**
 * Normalizes summary string, trimming whitespace and capping at 200 characters
 */
function normalizeSummary(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  return normalized.slice(0, 200);
}

/**
 * Normalizes task arrays and assigns deterministic server IDs
 */
function normalizeTaskList(items, prefix) {
  if (!Array.isArray(items)) {
    return [];
  }

  const validItems = [];
  items.forEach((item) => {
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

    let priority = 'medium';
    if (typeof item.priority === 'string') {
      const p = item.priority.trim().toLowerCase();
      if (p === 'high' || p === 'medium' || p === 'low') {
        priority = p;
      }
    }

    let deadline = null;
    if (typeof item.deadline === 'string') {
      const d = item.deadline.trim();
      if (d.length > 0) {
        deadline = d;
      }
    }

    const id = `${prefix}-${validItems.length + 1}`;

    validItems.push({
      id,
      task: taskText,
      priority,
      deadline
    });
  });

  return validItems;
}
