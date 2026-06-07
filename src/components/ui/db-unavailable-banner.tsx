import { Database } from "lucide-react";

export function DbUnavailableBanner() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
      <Database className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div>
        <p className="font-medium text-amber-100">Database unreachable from this server</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
          Runtime queries to Neon timed out (ETIMEDOUT). Check network/firewall, try{" "}
          <code className="font-mono text-[11px]">DB_DRIVER=http</code> or{" "}
          <code className="font-mono text-[11px]">DB_DRIVER=pg</code> in{" "}
          <code className="font-mono text-[11px]">.env</code>, or migrate Neon to a closer
          region (e.g. ap-southeast-1). Local fallback:{" "}
          <code className="font-mono text-[11px]">USE_LOCAL_DB=1 ./start.sh dev</code>.
        </p>
      </div>
    </div>
  );
}
