# Ollama Setup & Quick Start

Get started with local AI models in Qeda using Ollama in 5 minutes.

## Prerequisites

- macOS, Linux, or Windows
- At least 2GB RAM per model (4GB+ recommended)
- ~500MB - 50GB disk space depending on model size

## Installation

### macOS / Linux

1. Visit https://ollama.ai
2. Download and install
3. Start Ollama from the Applications menu or:
   ```bash
   ollama serve
   ```

### Windows

1. Download from https://ollama.ai/download
2. Run installer
3. Ollama starts automatically in the background
4. Or manually start: `ollama serve`

## Pull Your First Model

In a new terminal (while Ollama is running):

```bash
# Small, fast model - recommended to start
ollama pull qwen3.5:0.8b

# Other options
ollama pull mistral
ollama pull neural-chat
ollama pull phi
```

Models are stored in:
- **macOS/Linux**: `~/.ollama/models`
- **Windows**: `%USERPROFILE%\.ollama\models`

## Configure Qeda

1. Open Qeda Settings
2. Go to **AI & Models** → **Providers**
3. Select **"Ollama (local, no key)"** from the provider dropdown
4. Click **"Refresh models"**
5. Select a model from the list
6. Click **Save**

## Start Chatting

That's it! Go to Chat and start using your local model.

No API keys, no network needed, everything runs on your machine.

## Verify It Works

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# List installed models
ollama list

# Try a quick test
ollama run qwen3.5:0.8b "Hello, what is your name?"
```

## Troubleshooting

### Models don't show up

1. Make sure Ollama is running: `ollama serve`
2. Verify a model is installed: `ollama list`
3. If empty, pull one: `ollama pull qwen3.5:0.8b`
4. In Qeda, click "Refresh models" again

### Connection error

- Ollama not running? Start it: `ollama serve`
- Wrong port? Check it's on 11434: `curl http://localhost:11434/api/tags`
- Windows firewall? May need to allow localhost access

### Chat is slow

- Check available RAM: `ollama ps`
- Try a smaller model: `ollama pull phi` (~2.6GB)
- Close other applications to free up memory

### Out of memory

- Reduce model size: `ollama pull qwen3.5:0.8b` (~530MB)
- Or limit context: Model settings in Settings → AI & Models

## Model Recommendations by Hardware

### Minimal (2GB RAM)
- `ollama pull phi` (~2.6GB)
- `ollama pull qwen3.5:0.8b` (~530MB)
- `ollama pull tinyllama` (~400MB)

### Standard (8GB RAM)
- `ollama pull mistral` (~4GB)
- `ollama pull neural-chat` (~5GB)
- `ollama pull qwen:14b` (~8GB)

### Powerful (16GB+ RAM)
- `ollama pull llama3` (~4.7GB)
- `ollama pull llama2:70b` (~40GB)
- `ollama pull dolphin-mixtral` (~26GB)

## Common Commands

```bash
# Start Ollama (if not auto-starting)
ollama serve

# List all installed models
ollama list

# Pull a new model
ollama pull mistral

# Remove a model to save space
ollama rm mistral

# See what's currently running
ollama ps

# Test a model directly
ollama run mistral "What is the capital of France?"

# Get help
ollama help
ollama pull --help
```

## Features

With Ollama in Qeda, you get:

✓ **Automatic Fallback**: If your primary provider fails, Qeda tries your local Ollama model  
✓ **Model Management**: See installed models, refresh list, get model info  
✓ **No API Keys**: Everything runs locally, nothing sent to the cloud  
✓ **Fast**: Run multiple times without rate limits  
✓ **Privacy**: Your prompts and responses never leave your machine  

## Need More Help?

- **User Guide**: See [docs/providers/OLLAMA.md](./providers/OLLAMA.md)
- **Architecture**: See [docs/providers/README.md](./providers/README.md)
- **Ollama Docs**: https://github.com/ollama/ollama/blob/main/README.md
- **Model Library**: https://ollama.ai/library

Happy local inferencing! 🚀
