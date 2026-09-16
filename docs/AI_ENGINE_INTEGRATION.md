# AI Engine Integration & Verification Guide (`media_cataloger`)

This guide specifies the communication protocol, verification endpoints, and payload contracts between **`media_cataloger_web`** (React 19 + NestJS Gateway) and the **`media_cataloger`** Python AI Processing Engine.

---

## 1. Architecture Overview

```
+-------------------------------------------------------------+
|                      Machine A (Web Tier)                   |
|  * React 19 Client SPA (Gallery, Media Viewer, Family Tree) |
|  * NestJS Backend Gateway (/api proxy & SQLite cache)       |
+------------------------------+------------------------------+
                               |
                   HTTP / REST | (Configurable via CATALOGER_API_URL)
                               v
+-------------------------------------------------------------+
|                     Machine B (AI Engine Tier)              |
|  * Python 3.10+ (FastAPI / Uvicorn Daemon)                  |
|  * OpenCV, InsightFace, Whisper, ExifTool, LLM Client       |
+-------------------------------------------------------------+
```

`media_cataloger_web` verifies the availability of `media_cataloger` before enabling AI-dependent actions (such as the single-file analysis button `btnAnalyzeFile` in the Media Viewer).

---

## 2. Required Endpoints on `media_cataloger`

To ensure full compatibility and real-time status verification, the Python `media_cataloger` service must implement the following REST endpoints.

### 2.1. System & Engine Health: `GET /api/status`

Used by `media_cataloger_web` for polling pipeline state, queue progress, and engine readiness.

- **Method**: `GET`
- **Route**: `/api/status`
- **Recommended Response (HTTP 200)**:

```json
{
  "status": "idle",
  "connected": true,
  "version": "2.4.0",
  "engine_ready": true,
  "models_loaded": {
    "face_detection": true,
    "face_recognition": true,
    "whisper": true,
    "vision_llm": true
  },
  "device": "cuda:0",
  "current_task": null,
  "current_file": null,
  "progress": {
    "current": 0,
    "total": 0,
    "percentage": 0.0
  },
  "queue": {
    "pending_count": 0,
    "in_flight_files": []
  }
}
```

#### Status Values:
| Status | Description |
|---|---|
| `idle` | Engine is online, idle, and ready to accept new jobs. |
| `running` | Engine is actively processing files. |
| `paused` | Processing has been temporarily suspended by user. |
| `error` | Engine encountered an unrecoverable failure; detail in `error` field. |

---

### 2.2. Lightweight Health Ping: `GET /api/health`

Used for fast, low-overhead connectivity probes and latency checks.

- **Method**: `GET`
- **Route**: `/api/health`
- **Recommended Response (HTTP 200)**:

```json
{
  "status": "healthy",
  "timestamp": 1788341400.123,
  "models_ready": true,
  "gpu_memory_used_mb": 2140
}
```

---

### 2.3. Single File Analysis: `POST /api/analyze-file`

Invoked when the user triggers **⚡ Analyze / Reprocess This File** (`btnAnalyzeFile`) from the Media Viewer or Admin Panel.

- **Method**: `POST`
- **Route**: `/api/analyze-file`
- **Request Payload**:

```json
{
  "file": "C:/Photos/2026/family_vacation.jpg",
  "filename": "family_vacation.jpg",
  "folder": "C:/Photos/2026",
  "file_size": 4194304,
  "mtime": 1788340000.0,
  "output_folder": "C:/CatalogOutput",
  "stream_url": "http://web-gateway:8000/api/media/file?path=C%3A%2FPhotos%2F2026%2Ffamily_vacation.jpg",
  "settings": {
    "llm_provider": "gemini",
    "enable_face_recognition": true,
    "enable_transcription": true
  }
}
```

- **Recommended Response (HTTP 200)**:

```json
{
  "status": "success",
  "file": "C:/Photos/2026/family_vacation.jpg",
  "summary": "A family picnic by the lake on a sunny afternoon.",
  "summary_ru": "Семейный пикник у озера в солнечный день.",
  "description": "Four people sitting on a blanket near the lake shore with mountains in the background.",
  "description_ru": "Четыре человека сидят на пледе у берега озера на фоне гор.",
  "location_name": "Lake Tahoe, California",
  "environment": "outdoor",
  "lighting": "natural_daylight",
  "weather": "sunny",
  "time_of_day": "afternoon",
  "tags": ["picnic", "family", "lake", "summer", "vacation"],
  "faces": [
    {
      "face_id": "face_a1b2c3d4",
      "name": "Alice Smith",
      "confidence": 0.94,
      "bounding_box": [120, 85, 230, 210]
    }
  ],
  "sidecar_path": "C:/CatalogOutput/metadata/family_vacation.json"
}
```

---

### 2.4. Batch & Pipeline Control Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/run` | `POST` | Trigger batch cataloging pipeline. Body: `{ force?: boolean, folders?: string[] }` |
| `/api/pause` | `POST` | Pause the active batch pipeline without losing position. |
| `/api/resume` | `POST` | Resume execution from the paused state. |
| `/api/stop` | `POST` | Cancel current job queue and return to `idle`. |
| `/api/logs` | `GET` | Stream or return recent log buffer lines. |

---

## 3. Python FastAPI Reference Implementation

Here is a reference snippet for `media_cataloger`'s FastAPI application:

```python
from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import time

app = FastAPI(title="Media Cataloger AI Engine", version="2.4.0")

class AnalyzeFileRequest(BaseModel):
    file: str
    filename: Optional[str] = None
    folder: Optional[str] = None
    file_size: Optional[int] = None
    mtime: Optional[float] = None
    output_folder: Optional[str] = None
    stream_url: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "models_ready": True
    }

@app.get("/api/status")
async def get_status():
    return {
        "status": "idle",
        "connected": True,
        "version": "2.4.0",
        "engine_ready": True,
        "models_loaded": {
            "face_detection": True,
            "face_recognition": True,
            "whisper": True
        }
    }

@app.post("/api/analyze-file")
async def analyze_file(req: AnalyzeFileRequest):
    if not req.file:
        raise HTTPException(status_code=400, detail="Missing required 'file' parameter")
    
    # Process with OpenCV / InsightFace / LLM pipeline
    # ...
    return {
        "status": "success",
        "file": req.file,
        "summary": "Processed file metadata summary",
        "faces": []
    }
```

---

## 4. Verification Logic in `media_cataloger_web`

1. **Client / UI Layer (`MediaViewerModal.tsx`)**:
   - Checks `isEngineConnected`. If `false`, `btnAnalyzeFile` is disabled with a tooltip (`media_cataloger AI Engine is offline or disconnected`).
   - If `true` and pipeline is not busy, the button is enabled and triggers `onStartSingleAnalysis`.

2. **Backend Gateway Layer (`CatalogerClientService.ts`)**:
   - `validateConnection()` sends a request with a 4-second timeout to `${CATALOGER_API_URL}/api/status`.
   - On success, reports latency in milliseconds and extracts `connected: true`.
   - On network error or timeout, reports `connected: false` with actionable diagnostic guidance.
