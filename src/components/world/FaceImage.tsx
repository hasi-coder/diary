// A person's face as a small round image: their front face photo, or the drawn face.
import { useMemo } from "react";
import { mediaUrl, type Profile } from "../../lib/api";
import { faceAvatar } from "./faces";

export function FaceImage({ profile, className = "h-8 w-8" }: { profile: Profile; className?: string }) {
  const front = profile.faces?.front;
  const drawn = useMemo(() => (front ? null : faceAvatar(profile, 96).toDataURL()), [front, profile]);
  return <img src={front ? mediaUrl(front.id) : drawn!} alt="" draggable={false} className={`shrink-0 rounded-full bg-slate-200 object-cover ${className}`} />;
}
