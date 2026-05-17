import { Component, type ErrorInfo, type ReactNode } from "react";
import { clearErrorLog, logError } from "@/lib/error-logger";

type Props = {
  children: ReactNode;
  label?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = {
  error: Error | null;
  info: ErrorInfo | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError({
      type: "manual",
      message: `${this.props.label ?? "UI"}: ${error.message}`,
      stack: `${error.stack ?? ""}\n${info.componentStack ?? ""}`,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    });
    this.props.onError?.(error, info);
    this.setState({ info });
  }

  reset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[70vh] bg-background px-4 py-6 text-foreground">
        <div className="mx-auto max-w-xl space-y-4 rounded-lg border bg-card p-4 shadow-card">
          <div>
            <h1 className="text-lg font-semibold">Application stabilisée</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Une erreur a été interceptée avant l'écran blanc. Le formulaire reste récupérable.
            </p>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <div className="font-medium">Erreur</div>
            <div className="mt-1 break-words text-muted-foreground">
              {this.state.error.message || "Erreur inconnue"}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Réessayer sans recharger
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium text-foreground"
            >
              Recharger la page
            </button>
            <button
              type="button"
              onClick={clearErrorLog}
              className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              Effacer logs
            </button>
          </div>
        </div>
      </div>
    );
  }
}