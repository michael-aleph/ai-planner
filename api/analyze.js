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

    const systemInstructionText = `You are an AI task planner assistant. Analyze the provided English text and divide tasks into two blocks: "today" and "tomorrow". Default to "today" if no specific date is mentioned. For each task, extract:
1. "task": clean, concise action text in English. Remove date/time phrases from the task text when represented by classification or deadline fields.
2. "priority": "high", "medium", or "low". Use "high" conservatively, primarily when urgency or importance is explicit. Default to "medium".
3. "deadline": specific time or period string if explicitly mentioned (e.g. "6:00 PM", "morning"), or null if absent.

Return ONLY a single valid JSON object without markdown formatting, code fences, or additional text.
Response structure:
{
  "today": [
    { "task": "text", "priority": "high/medium/low", "deadline": "string or null" }
  ],
  "tomorrow": [
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

    // Normalize task lists and generate deterministic IDs
    const formattedResult = {
      today: normalizeTaskList(parsedResult.today, 'today'),
      tomorrow: normalizeTaskList(parsedResult.tomorrow, 'tomorrow')
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
