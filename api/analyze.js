export default async function handler(req, res) {
  // Allow POST requests only
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        // Fallback if req.body is plain string
      }
    }

    const { text } = body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Будь ласка, надайте текст для аналізу.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on server.' });
    }

    const systemInstructionText = `Ти — AI-асистент планувальника завдань. Проаналізуй наданий текст українською мовою та розподіли завдання на два блоки: сьогодні (today) та завтра (tomorrow). Визнач пріоритет (high, medium, low) для кожного завдання. Поверни результат виключно у форматі JSON без використання markdown-розмітки. Структура відповіді: { "today": [ { "task": "текст завдання", "priority": "high/medium/low" } ], "tomorrow": [ { "task": "текст завдання", "priority": "high/medium/low" } ] }.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: text }]
          }
        ],
        systemInstruction: {
          parts: [
            { text: systemInstructionText }
          ]
        },
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errorPayload = await response.text();
      return res.status(response.status).json({ error: `Gemini API Error: ${errorPayload}` });
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    // Strip markdown code block fences if present
    const cleanedText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsedResult;
    try {
      parsedResult = JSON.parse(cleanedText);
    } catch (parseError) {
      return res.status(500).json({ error: 'Не вдалося розпарсити результат JSON від Gemini API.', raw: rawText });
    }

    // Ensure valid fallback arrays
    const formattedResult = {
      today: Array.isArray(parsedResult.today) ? parsedResult.today : [],
      tomorrow: Array.isArray(parsedResult.tomorrow) ? parsedResult.tomorrow : []
    };

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(formattedResult);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Внутрішня помилка сервера.' });
  }
}
