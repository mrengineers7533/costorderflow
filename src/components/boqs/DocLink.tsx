import { useEffect, useState } from "react";
import { signedDocUrl } from "@/lib/boq/designReview";

/** Anchor that resolves a private design-review-docs path to a short-lived signed URL. */
export function DocLink({
  filePath,
  fileName,
  className,
}: {
  filePath: string;
  fileName: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    signedDocUrl(filePath).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [filePath]);
  if (!url) {
    return <span className={className}>{fileName}</span>;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      {fileName}
    </a>
  );
}