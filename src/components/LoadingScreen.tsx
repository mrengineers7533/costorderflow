export function LoadingScreen({ label = "Loading" }: { label?: string }) {
  return (
    <div className="min-h-screen w-full grid place-items-center bg-background">
      <div className="flex flex-col items-center gap-8 animate-fade-in">
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-2xl animate-pulse" />
          <div className="relative h-28 w-28 rounded-3xl bg-card border border-border/60 shadow-elevated grid place-items-center overflow-hidden">
            <div className="loader" />
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
        .loader {
          height: 30px;
          aspect-ratio: 5;
          display: grid;
          --_g: no-repeat radial-gradient(farthest-side, hsl(var(--primary)) 94%, #0000);
        }
        .loader:before,
        .loader:after {
          content: "";
          grid-area: 1/1;
          background:
            var(--_g) left,
            var(--_g) right;
          background-size: 20% 100%;
          animation: l32 1s infinite;
        }
        .loader:after {
          background:
            var(--_g) calc(1 * 100% / 3),
            var(--_g) calc(2 * 100% / 3);
          background-size: 20% 100%;
          animation-direction: reverse;
        }
        @keyframes l32 {
          80%, 100% { transform: rotate(0.5turn); }
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
