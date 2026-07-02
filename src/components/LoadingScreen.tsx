import "@/styles/loader.css";

export function LoadingScreen({ label = "Loading" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background">
      <div className="flex flex-col items-center justify-center gap-5 animate-fade-in text-center">
        <div className="l49-loader" role="status" aria-label={label} />
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
