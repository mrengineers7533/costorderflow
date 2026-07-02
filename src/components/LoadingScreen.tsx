export function LoadingScreen({ label = "Loading" }: { label?: string }) {
  return (
    <div className="min-h-screen w-full grid place-items-center bg-background">
      <div className="flex flex-col items-center gap-6 animate-fade-in">
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-2xl animate-pulse" />
          <div className="relative h-24 w-24 rounded-3xl bg-card border border-border/60 shadow-elevated grid place-items-center overflow-hidden">
            <svg
              viewBox="0 0 40 40"
              className="h-12 w-12"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="20"
                cy="20"
                r="16"
                stroke="hsl(var(--muted))"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <circle
                cx="20"
                cy="20"
                r="16"
                stroke="hsl(var(--primary))"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray="60 100"
                className="animate-[infinity-spin_1.2s_linear_infinite]"
                style={{ transformOrigin: "center" }}
              />
            </svg>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 w-48">
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-primary animate-[infinity-slide_1.5s_ease-in-out_infinite]" />
          </div>
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            {label}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes infinity-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes infinity-slide {
          0%   { transform: translateX(-100%); width: 25%; }
          50%  { transform: translateX(100%); width: 50%; }
          100% { transform: translateX(300%); width: 25%; }
        }
      `}</style>
    </div>
  );
}
