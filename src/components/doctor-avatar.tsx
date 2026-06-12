import { getDoctorAvatar, normalizeDoctorName } from "@/lib/doctor-avatars";
import { getOverrideUrl, roleSubject, useAvatarVersion } from "@/lib/avatar-store";
import { cn } from "@/lib/utils";
import designerPhoto from "@/assets/team/designer.jpg.asset.json";
import technicianPhoto from "@/assets/team/technician.jpg.asset.json";

const ROLE_DEFAULT_PHOTO: Record<"designer" | "technician", string> = {
  designer: designerPhoto.url,
  technician: technicianPhoto.url,
};

interface DoctorAvatarProps {
  name: string | null | undefined;
  /** When set, resolves a staff role photo (designer/technician) instead of a doctor photo. */
  roleKey?: "designer" | "technician";
  /** Tailwind size classes e.g. "size-10". Defaults to size-10. */
  className?: string;
  /** Extra classes for the fallback initial circle. */
  fallbackClassName?: string;
  /** Rounded shape: full circle (default) or rounded square. */
  rounded?: "full" | "2xl" | "xl" | "lg";
}

/**
 * Professional "sticker" avatar shown next to a doctor (or staff) name.
 * Admin-assigned photos take priority; falls back to the first letter of the name.
 */
export function DoctorAvatar({ name, roleKey, className, fallbackClassName, rounded = "full" }: DoctorAvatarProps) {
  // Re-render whenever admin assigns/removes a photo.
  useAvatarVersion();

  const url = roleKey
    ? getOverrideUrl(roleSubject(roleKey)) || ROLE_DEFAULT_PHOTO[roleKey]
    : getDoctorAvatar(name);
  const roundCls = rounded === "full" ? "rounded-full" : `rounded-${rounded}`;
  const initial = normalizeDoctorName(name || "").charAt(0) || "?";

  if (url) {
    return (
      <img
        src={url}
        alt={name || "صورة"}
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
