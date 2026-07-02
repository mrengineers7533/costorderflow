export function LoadingScreen({ label = "Loading" }: { label?: string }) {
  return (
    <div className="min-h-screen w-full grid place-items-center bg-background">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="h-10 w-10 rounded-full border-2 border-muted border-t-primary" />
        <p className="text-sm font-medium text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}
