# Getting Your Gemini API Key

Create a Gemini API key in Google AI Studio:

https://aistudio.google.com/apikey

Add it to `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
GEMINI_MODEL=gemini-3.5-flash
```

Restart the backend after changing `.env`.

The backend uses Gemini's OpenAI-compatible endpoint, so the existing `openai` Python package remains the transport client. If the Gemini request fails, the backend logs the exact error and the `/api/query` response includes `ai_status: "fallback"` plus `ai_error`.
