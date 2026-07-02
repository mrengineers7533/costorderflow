import "@/styles/loader.css";

export function LoadingScreen({ label = "Loading" }: { label?: string }) {
  return (
    <div className="min-h-screen w-full grid place-items-center bg-background">
      <div className="flex flex-col items-center gap-5 animate-fade-in">
        <div className="l49-loader" role="status" aria-label={label} />
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
