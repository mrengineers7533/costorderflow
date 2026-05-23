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
          <div className="relative h-1 w-40 overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary animate-[loading-bar_1.4s_ease-in-out_infinite]" />
          </div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        </div>
      </div>
      <style>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
