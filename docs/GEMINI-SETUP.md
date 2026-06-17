# Gemini API Key Setup Guide

This guide explains how to set up your **Gemini 2.5 Flash** API key for Ghost Persona's LLM-powered file change summarization.

## Quick Start

### Option 1: Environment Variable (Recommended)

Set your API key before running Ghost:

```bash
# macOS / Linux
export GEMINI_API_KEY="your-api-key-here"
ghost watch

# Windows (PowerShell)
$env:GEMINI_API_KEY="your-api-key-here"
ghost watch

# Windows (CMD)
set GEMINI_API_KEY=your-api-key-here
ghost watch
```

### Option 2: Ghost-Specific Variable

```bash
export GHOST_LLM_API_KEY="your-api-key-here"
ghost watch
```

### Option 3: Configuration File

1. Initialize Ghost (if not already done):
   ```bash
   ghost init
   ```

2. Edit `.ghost/config.json`:
   ```json
   {
     "summarization": "llm",
     "llmApiKey": "your-api-key-here",
     "llmModel": "gemini-2.5-flash"
   }
   ```

3. Start watching:
   ```bash
   ghost watch
   ```

---

## Getting Your Gemini API Key

### Step 1: Go to Google AI Studio

Visit [https://aistudio.google.com/](https://aistudio.google.com/) and sign in with your Google account.

### Step 2: Navigate to API Keys

1. Click on your profile picture in the top-right corner
2. Select "API Keys" from the dropdown menu
3. Or visit: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)

### Step 3: Create a New API Key

1. Click "Create new key"
2. Give it a name (e.g., "Ghost Persona")
3. Click "Create"
4. **Copy the key immediately** - it will only be shown once!

### Step 4: Enable Billing (Required)

> ⚠️ **IMPORTANT**: The Gemini API requires billing to be enabled.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Enable billing if not already enabled
4. Ensure you have credits available

---

## Verification

To verify your API key is working:

```bash
# Set the key
export GEMINI_API_KEY="your-api-key-here"

# Create a test file change
touch test-file.ts

# Ghost should now use LLM summarization
ghost watch
```

Check the console output - if LLM summarization is working, you'll see richer, context-aware summaries of your file changes.

---

## Environment Variable Priority

Ghost Persona checks for API keys in this order:

1. `GHOST_LLM_API_KEY` (Ghost-specific)
2. `GEMINI_API_KEY` (Generic)
3. `.ghost/config.json` (Configuration file)

The first valid key found will be used.

---

## Troubleshooting

### API Calls Failing with Authentication Errors

**Symptoms**:
- `403 Forbidden` errors
- `Invalid API key` messages

**Solutions**:
1. Verify your API key is correct
2. Check that you've copied the entire key (no missing characters)
3. Ensure billing is enabled on your Google Cloud project
4. Verify the key has the "AI Studio API" permission

### LLM Summarization Not Working

**Symptoms**:
- Only seeing basic file change summaries
- No context-aware explanations

**Solutions**:
1. Verify `summarization` is set to `"llm"` in config.json
2. Check that your API key is valid
3. Test with environment variable: `GEMINI_API_KEY=your-key ghost watch`
4. Check your network connection

### Falling Back to Rule-Based Mode

**Symptoms**:
- Ghost works but uses simple summaries
- Logs show fallback to rule-based

**Solutions**:
- This is expected if no API key is provided
- Also happens if the API returns an error
- Check your network connection and API key validity
- Try the API key directly with curl:
  ```bash
  curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=YOUR_KEY" \
    -H "Content-Type: application/json" \
    -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
  ```

### Rate Limiting

**Symptoms**:
- `429 Too Many Requests` errors
- Slow responses

**Solutions**:
1. Implement request batching (already done in Ghost Persona)
2. Consider upgrading your Google Cloud plan
3. Monitor your usage in Google Cloud Console

---

## Security Best Practices

### ✅ Do This

- Store API keys in environment variables (not in code)
- Use `.gitignore` to exclude `.ghost/config.json`
- Rotate keys periodically
- Use different keys for different projects

### ❌ Don't Do This

- Never commit API keys to git
- Don't share keys in chat or documentation
- Don't hardcode keys in source files
- Don't use the same key across multiple projects without rotation

---

## Model Information

Ghost Persona uses **Gemini 2.5 Flash** by default:

- **Model**: `gemini-2.5-flash`
- **API Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- **Response Format**: JSON (configured via `responseMimeType: 'application/json'`)

### Using a Different Model

You can specify a different model:

```json
{
  "llmModel": "gemini-2.5-pro"
}
```

Or via environment variable:

```bash
export GEMINI_MODEL="gemini-2.5-pro"
```

### Available Models

- `gemini-2.5-flash` (Recommended - fast and cost-effective)
- `gemini-2.5-pro` (More capable, higher cost)
- `gemini-1.5-flash` (Legacy - still supported)

---

## Pricing

As of June 2026, Google AI Studio pricing:

| Model | Input ($/1M tokens) | Output ($/1M tokens) |
|-------|---------------------|----------------------|
| gemini-2.5-flash | $0.50 | $1.50 |
| gemini-2.5-pro | $2.50 | $7.50 |

> ⚠️ **Prices may have changed**. Check [Google AI Pricing](https://ai.google.dev/pricing) for current rates.

Ghost Persona batches file changes to minimize API calls and costs.

---

## Support

For issues with:
- **Ghost Persona**: Open an issue at [github.com/ghost-persona/ghost-persona](https://github.com/ghost-persona/ghost-persona)
- **Gemini API**: Visit [Google AI Studio Help](https://ai.google.dev/docs)
- **Billing**: Check [Google Cloud Billing Support](https://cloud.google.com/billing/docs)
