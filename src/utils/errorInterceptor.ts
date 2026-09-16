export interface LogLine {
  id: string;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  context: string;
  message: string;
  details?: string;
  stack?: string;
  raw: string;
}

type LogListener = (log: LogLine) => void;

class ErrorInterceptorService {
  private listeners: Set<LogListener> = new Set();
  private isInitialized = false;
  private originalFetch: typeof window.fetch | null = null;

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emitLog(
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
    context: string,
    message: string,
    details?: string,
    stack?: string
  ): LogLine {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const contextTag = context ? `[${context}]` : '[App]';

    let formattedDetails = '';
    if (details) {
      formattedDetails = `\n  Details: ${details}`;
    }

    let formattedStack = '';
    if (stack) {
      formattedStack = `\n  Stack Trace:\n    ${stack.split('\n').map(s => s.trim()).filter(Boolean).join('\n    ')}`;
    }

    const raw = `[${timestamp}] [${level}] ${contextTag} ${message}${formattedDetails}${formattedStack}`;

    const logEntry: LogLine = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp,
      level,
      context,
      message,
      details,
      stack,
      raw,
    };

    for (const listener of this.listeners) {
      try {
        listener(logEntry);
      } catch (err) {
        console.error('Error in log listener:', err);
      }
    }

    return logEntry;
  }

  public init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // 1. Intercept global window runtime errors
    window.addEventListener('error', (event) => {
      const msg = event.message || 'Unknown runtime error';
      const source = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : 'window';
      const stack = event.error?.stack;
      this.emitLog('ERROR', 'Runtime', `Uncaught exception: ${msg}`, `Source: ${source}`, stack);
    });

    // 2. Intercept unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      let msg = 'Unhandled Promise rejection';
      let stack: string | undefined;
      let details: string | undefined;

      if (reason instanceof Error) {
        msg = reason.message;
        stack = reason.stack;
      } else if (typeof reason === 'string') {
        msg = reason;
      } else if (reason && typeof reason === 'object') {
        try {
          details = JSON.stringify(reason);
        } catch {
          details = String(reason);
        }
      }

      this.emitLog('ERROR', 'UnhandledRejection', msg, details, stack);
    });

    // 3. Intercept window.fetch for API network and HTTP errors
    if (window.fetch && !this.originalFetch) {
      this.originalFetch = window.fetch;
      const self = this;

      window.fetch = async function (...args: Parameters<typeof window.fetch>): Promise<Response> {
        const input = args[0];
        const init = args[1];
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
        const method = init?.method || (input instanceof Request ? input.method : 'GET');

        // Do not intercept external telemetry or background polling routes in an endless loop
        const isPollingOrLogFetch = typeof url === 'string' && (
          url.includes('/api/logs') ||
          url.includes('/api/media/scan-status') ||
          url.includes('/api/status')
        );

        try {
          const response = await self.originalFetch!.apply(this, args);

          // Skip asset 404s (e.g. missing optional face thumbnails) from emitting error dialogs
          const isAsset404 = response.status === 404 && typeof url === 'string' && (
            url.includes('/api/faces/image/') ||
            url.includes('/api/media/thumbnail')
          );

          if (!response.ok && !isPollingOrLogFetch && !isAsset404) {
            // Clone response to safely read error body without consuming caller's stream
            const cloned = response.clone();
            cloned.text().then((bodyText) => {
              let parsedDetail = bodyText;
              try {
                const parsed = JSON.parse(bodyText);
                parsedDetail = parsed.message || parsed.detail || parsed.error || bodyText;
              } catch {
                // Not JSON
              }

              const explanation = self.getHttpErrorExplanation(response.status, url, parsedDetail);
              self.emitLog(
                'ERROR',
                'APIInterceptor',
                `HTTP ${response.status} (${response.statusText || 'Error'}) on ${method} ${url}: ${parsedDetail}`,
                explanation
              );
            }).catch(() => {
              self.emitLog(
                'ERROR',
                'APIInterceptor',
                `HTTP ${response.status} on ${method} ${url}`
              );
            });
          }

          return response;
        } catch (networkErr: any) {
          if (!isPollingOrLogFetch) {
            self.emitLog(
              'ERROR',
              'NetworkInterceptor',
              `Network request failed: ${method} ${url} - ${networkErr.message || 'Connection refused / Offline'}`,
              `Check if the backend server is running and accessible at the host port.`,
              networkErr.stack
            );
          }
          throw networkErr;
        }
      };
    }
  }

  private getHttpErrorExplanation(status: number, url: string, message: string): string {
    const lines: string[] = [];
    lines.push(`Target: ${url}`);
    lines.push(`Status Code: ${status}`);

    if (status === 502) {
      lines.push('Diagnosis: Bad Gateway - The backend cataloger AI daemon appears to be offline or unreachable on port 8001.');
      lines.push('Suggestion: Ensure the Python media_cataloger service is running or check server logs.');
    } else if (status === 404) {
      lines.push('Diagnosis: Resource not found.');
      lines.push('Suggestion: Verify that the media file or face ID exists in the database.');
    } else if (status === 400) {
      lines.push('Diagnosis: Bad Request - Missing or invalid parameters.');
      lines.push('Suggestion: Check parameter formats and directory permissions.');
    } else if (status === 500) {
      lines.push('Diagnosis: Internal Server Error.');
      lines.push('Suggestion: Review server-side exception logs for stack traces.');
    }

    if (message) {
      lines.push(`Server Response: ${message}`);
    }

    return lines.join('\n  ');
  }
}

export const errorInterceptor = new ErrorInterceptorService();
