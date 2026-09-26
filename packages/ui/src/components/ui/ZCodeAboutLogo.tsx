import dweisLogoUrl from "@/assets/provider-icons/logo-dweis.svg";
import { cn } from "@/components/lib/utils.js";

export function ZCodeAboutLogo({ className }: { className?: string }) {
  return (
    <img
      src={dweisLogoUrl}
      alt="DWeis Next"
      className={cn("h-auto w-10 shrink-0 select-none", className)}
      draggable={false}
    />
  );
}
