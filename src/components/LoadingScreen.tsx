import gmsLogo from "@/assets/gms-logo.png";

export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="min-h-screen w-full grid place-items-center bg-background">
      <div className="flex flex-col items-center gap-6 animate-fade-in">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl animate-pulse" />
          <div className="relative h-20 w-20 rounded-2xl bg-card border border-border/60 shadow-lg grid place-items-center overflow-hidden">
            <img src={gmsLogo} alt="" className="h-12 w-auto animate-[pulse_2s_ease-in-out_infinite]" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <svg
            viewBox="0 0 100 40"
            className="h-10 w-24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M20,20 C20,8 35,8 50,20 C65,32 80,32 80,20 C80,8 65,8 50,20 C35,32 20,32 20,20 Z"
              stroke="hsl(var(--muted))"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M20,20 C20,8 35,8 50,20 C65,32 80,32 80,20 C80,8 65,8 50,20 C35,32 20,32 20,20 Z"
              stroke="hsl(var(--primary))"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="40 160"
              className="animate-[infinity-dash_1.6s_linear_infinite]"
            />
          </svg>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        </div>
      </div>
      <style>{`
        @keyframes infinity-dash {
          0%   { stroke-dashoffset: 200; }
          100% { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}
