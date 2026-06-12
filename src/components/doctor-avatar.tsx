import { getDoctorAvatar, normalizeDoctorName } from "@/lib/doctor-avatars";
import { cn } from "@/lib/utils";

interface DoctorAvatarProps {
  name: string | null | undefined;
  /** Tailwind size classes e.g. "size-10". Defaults to size-10. */
  className?: string;
  /** Extra classes for the fallback initial circle. */
  fallbackClassName?: string;
  /** Rounded shape: full circle (default) or rounded square. */
  rounded?: "full" | "2xl" | "xl" | "lg";
}

/**
 * Professional doctor "sticker" avatar shown next to a doctor name.
 * Falls back to the first letter of the name when no photo is mapped.
 */
export function DoctorAvatar({ name, className, fallbackClassName, rounded = "full" }: DoctorAvatarProps) {
  const url = getDoctorAvatar(name);
  const roundCls = rounded === "full" ? "rounded-full" : `rounded-${rounded}`;
  const initial = normalizeDoctorName(name || "").charAt(0) || "?";

  if (url) {
    return (
      <img
        src={url}
        alt={name || "طبيب"}
        loading="lazy"
        className={cn(
          "object-cover shrink-0 ring-2 ring-gold/60 shadow-gold bg-muted",
          roundCls,
          className || "size-10",
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "grid place-items-center shrink-0 gradient-gold text-gold-foreground font-extrabold ring-2 ring-gold/40",
        roundCls,
        className || "size-10",
        fallbackClassName,
      )}
    >
      {initial}
    </div>
  );
}
