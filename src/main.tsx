import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./planned.css";
import "./narrative.css";
import "./reconciliation.css";
import "./storylines.css";
import "./workers.css";
import "./control.css";
import "./championships.css";
import "./competitions.css";
import "./handoff.css";
import "./match-engine.css";
import "./match-setup.css";
import "./match-performance.css";
import "./match-resolution.css";
import "./live-card.css";
import "./consequences.css";
import "./narrative-generator.css";
import "./bridge.css";
import "./transfer.css";
import "./operations.css";
import "./workbench.css";
import "./profile-library.css";
import "./output-library.css";
import "./show-session.css";
import "./promotion-calendar.css";
import "./wrap-up.css";
import "./wrap-up-bridge.css";
import "./companion-home.css";
import "./starting-universe.css";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "An unknown browser error prevented the application from starting.";
}

function RuntimeFailure({ title, error }: { title: string; error: unknown }) {
  return (
    <main
      role="alert"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px",
        color: "#f4f7ff",
        background: "#07162a",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <section
        style={{
          width: "min(720px, 100%)",
          padding: "28px",
          border: "1px solid #5e7fac",
          background: "#101d30",
          boxShadow: "0 18px 45px rgba(0, 0, 0, 0.35)",
        }}
      >
        <p style={{ margin: "0 0 8px", color: "#f2de3f", fontWeight: 700 }}>
          TEW IX STORY TRACKER
        </p>
        <h1 style={{ margin: "0 0 16px", fontSize: "28px" }}>{title}</h1>
        <p style={{ margin: "0 0 16px", lineHeight: 1.6 }}>
          The application hit a browser compatibility error. Refresh the forwarded Codespaces preview
          after the development server reports that it is ready.
        </p>
        <pre
          style={{
            margin: 0,
            padding: "14px",
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
            color: "#ffb4b4",
            background: "#050b14",
            border: "1px solid #7b3030",
          }}
        >
          {describeError(error)}
        </pre>
      </section>
    </main>
  );
}

class RuntimeErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("TEW Story Tracker render failure", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <RuntimeFailure title="The interface could not be displayed" error={this.state.error} />;
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("The application root element is missing.");
}

const root = createRoot(rootElement);
root.render(
  <main
    aria-label="Starting TEW IX Story Tracker"
    style={{ minHeight: "100vh", background: "#07162a" }}
  />,
);

void import("./App")
  .then(({ default: App }) => {
    root.render(
      <StrictMode>
        <RuntimeErrorBoundary>
          <App />
        </RuntimeErrorBoundary>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    console.error("TEW Story Tracker startup failure", error);
    root.render(<RuntimeFailure title="The application could not start" error={error} />);
  });