Getting your OpenAI API key:

Go to OpenAI's API dashboard:

Visit https://platform.openai.com/account/api-keys
(If not logged in, you'll be prompted to sign in with your OpenAI account)
Create a new secret key:

Click the "Create new secret key" button
Choose a name for the key (optional, e.g., "DataLens")
Click "Create secret key"
Copy the key immediately:

The key will appear in a modal window (looks like: sk-...)
Click "Copy" or select and copy it manually
⚠️ Important: You won't see this key again after you close the modal—if you lose it, create a new one
Paste it into backend/.env:

Optional: Set usage limits

Go to https://platform.openai.com/account/billing/overview to check billing settings
Set a monthly usage limit if desired to avoid unexpected charges
That's it! Restart your backend and the app will now use GPT-4o-mini for advanced AI analysis instead of the rule-based fallback.

