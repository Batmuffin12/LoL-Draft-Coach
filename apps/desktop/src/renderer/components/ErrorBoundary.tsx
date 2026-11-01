import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../format";
import { Button } from "./Button";

/** The crash screen may come before the config's wording has arrived: never show bare ids here. */
function say(key: string, fallback: string): string {
  const text = t(key);
  return text === key ? fallback : text;
}

/** What's left when the panel can't draw: the window is frameless, so its controls have to be here. */
export function CrashScreen() {
  return (
    <div className="window">
      <header className="header">
        <span className="app">Draft Coach</span>
      </header>
      <div className="crash" role="alert">
        <p className="caption text">{say("crash.text", "Something went wrong drawing the panel.")}</p>
        <Button variant="primary" wide onClick={() => location.reload()}>
          {say("crash.reload", "Reload")}
        </Button>
        <Button wide onClick={() => window.coach.close()}>
          {say("crash.close", "Close")}
        </Button>
      </div>
    </div>
  );
}

/** A render error would otherwise leave a blank window with no way to close it. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    window.coach.reportError(`${error.message}${info.componentStack ?? ""}`);
  }

  override render(): ReactNode {
    return this.state.failed ? <CrashScreen /> : this.props.children;
  }
}
