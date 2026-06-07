import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "h-8 w-8",
    md: "h-9 w-9",
    lg: "h-11 w-11",
  };

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md ring-1 ring-white/20",
        sizes[size],
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        className="h-[70%] w-[70%]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6 22 L11 16 L15 19 L21 10 L26 14"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 24 H26"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.55"
        />
        <circle cx="26" cy="14" r="2" fill="#a7f3d0" />
      </svg>
    </div>
  );
}
