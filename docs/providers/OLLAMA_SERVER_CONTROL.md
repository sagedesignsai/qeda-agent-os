# Ollama Server Control Features

## Overview

Qeda can now start, check, and manage Ollama directly from the Settings UI. No need to open a terminal to manage your local models.

## New Features

### 1. Installation Detection

Automatically detects if Ollama is installed on the system:

```typescript
useOllamaInstallation()
  .checkInstallation()  // Async check
  .isInstalled          // Boolean
  .version              // Version string or null
```

**IPC Channel:**
- `ollama:is-installed` - Check if installed
- `ollama:get-version` - Get version string

### 2. Server Control

Start the Ollama server directly from the UI:

```typescript
useOllamaServerControl()
  .startServer()   // Async, returns success/error
  .isStarting      // Loading state
  .startError      // Error message if failed
  .startMessage    // Success message
```

**Platform-Specific Behavior:**
- **macOS:** Opens Ollama.app, which auto-starts the server
- **Windows:** Launches ollama.exe in background
- **Linux:** Runs `ollama serve` detached process

**IPC Channel:**
- `ollama:start-server` - Start the server

### 3. Model Pulling

Pull models directly from Ollama library:

```typescript
useOllamaModelPull()
  .pullModel(modelId)  // Async, background process
  .isPulling           // Loading state
  .progress            // Progress message
  .pullError           // Error if any
```

**Behavior:**
- Models download in background, app can close
- Process is detached from Ollama server
- Users see informational messages

**IPC Channel:**
- `ollama:pull-model` - Pull a model by ID

### 4. Running Models

Monitor and stop running models:

```typescript
useOllamaRunningModels()
  .getRunning()        // Fetch current list
  .running             // Array of model names
  .stopModel(modelId)  // Stop a specific model
```

**IPC Channels:**
- `ollama:get-running` - List active models
- `ollama:stop-model` - Stop a model

## UI Components

### OllamaView Settings Panel

Enhanced with new controls:

1. **Installation Status Card**
   - Shows if Ollama is installed
   - Displays version number
   - Links to download if not installed

2. **Server Status Card**
   - Shows running/not running status
   - Displays version (if installed)
   - **Start Ollama Server** button (when not running)
   - **Reconnect** button (when running)
   - Setup instructions and links

3. **Pull Model Card**
   - Text input for model name
   - **Pull** button
   - Example model names
   - Background download message

4. **Installed Models**
   - Shows all installed models
   - Refresh button
   - Checkmark for each

5. **Quick Commands**
   - Copy-paste terminal commands

## Implementation Details

### Shell Execution (`src/main/ai/ollama.ts`)

```typescript
// Check installation
isOllamaInstalled(): Promise<boolean>
getOllamaVersion(): Promise<string | null>

// Server control
startOllamaServer(): Promise<OllamaStartResult>

// Model management
pullOllamaModel(modelId, onProgress?): Promise<OllamaPullResult>
getRunningOllamaModels(): Promise<string[]>
stopOllamaModel(modelId): Promise<boolean>
```

### IPC Handlers (`src/main/ipc/handlers/ollama.ts`)

```typescript
'ollama:is-installed' → boolean
'ollama:get-version' → string | null
'ollama:start-server' → { success, pid, error, message }
'ollama:pull-model' → { success, modelId, progress, error }
'ollama:get-running' → string[]
'ollama:stop-model' → boolean
```

### React Hooks (`src/hooks/use-ollama.ts`)

```typescript
useOllamaInstallation()      // Check if installed
useOllamaServerControl()     // Start server
useOllamaModelPull()         // Pull models
useOllamaRunningModels()     // Manage running
```

## Error Handling

All operations provide helpful error messages:

### Installation Check Failures
- "Ollama not found in PATH"
- "Unable to detect Ollama version"
- → User directed to download

### Server Start Failures
- macOS: "Failed to open Ollama.app"
- Windows: "Failed to find ollama.exe"
- Linux: "ollama command not found"
- → Specific guidance for each platform

### Model Pull Failures
- "Invalid model ID" - Format validation
- "Connection refused" - Server not running
- "Model not found" - Typo or doesn't exist
- → Clear error messages

## User Workflow

**Before (Manual):**
1. User opens terminal
2. Runs `ollama serve`
3. Opens another terminal
4. Runs `ollama pull qwen3.5:0.8b`
5. Waits for download
6. Returns to Qeda

**After (Automated):**
1. Opens Qeda Settings → AI & Models → Ollama
2. Sees "Ollama not installed" OR "Server not running"
3. Clicks **"Start Ollama Server"**
4. Clicks in "Pull a Model" field
5. Types `qwen3.5:0.8b` and presses Enter
6. Done! Model downloads in background

## Performance

### Installation Check
- ~50ms - Runs `ollama --version`
- Cached for session (run once on startup)

### Server Start
- macOS: ~1s - Opens app
- Windows: ~1s - Spawns process
- Linux: ~100ms - Runs ollama serve

### Model Pull
- Detached process, non-blocking
- No impact on UI responsiveness
- Shows status feedback

## Platform-Specific Notes

### macOS
- Ollama.app must be installed from https://ollama.ai
- `open -a Ollama` auto-starts the server
- Server runs in background

### Windows
- Ollama installed via installer (.exe)
- Server runs as background service
- Check `%APPDATA%\Ollama\logs` for debug

### Linux
- Install via `curl https://ollama.ai/install.sh | sh`
- `ollama` command available in PATH
- Can be run as systemd service

## Future Enhancements

- [ ] Progress bars for model downloads
- [ ] Cancel model downloads
- [ ] Model storage location selector
- [ ] GPU/Memory usage monitoring
- [ ] Auto-start on app launch toggle
- [ ] Model uninstall from UI
- [ ] Model update checks

## Backward Compatibility

✓ All existing functionality unchanged  
✓ Shell execution fully optional  
✓ App works with manual `ollama serve`  
✓ No breaking changes to existing APIs  

## Testing

Test matrix for all platforms:

| Platform | Installed? | Start | Pull | Models |
|----------|-----------|-------|------|--------|
| macOS    | ✓ / ✗     | Yes   | Yes  | Yes    |
| Windows  | ✓ / ✗     | Yes   | Yes  | Yes    |
| Linux    | ✓ / ✗     | Yes   | Yes  | Yes    |

Each combination should be tested with:
- App cold start
- Settings tab switch
- Multiple model pulls
- Server restart
