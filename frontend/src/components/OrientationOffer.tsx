import { useState } from "react";
import { Compass } from "lucide-react";
import { markOrientationSeen, orientationSeen } from "../help/orientation";

/**
 * A first visit, in any room, offers the orientation once. Taking or declining it ends the offer
 * on this device; Help can start the tour again at any time.
 */
export function OrientationOffer({ onTour }: Readonly<{ onTour: () => void }>) {
  const [open, setOpen] = useState(() => !orientationSeen());
  if (!open) return null;
  const close = () => {
    markOrientationSeen();
    setOpen(false);
  };
  return (
    <section className="orientation-offer" aria-label="Tour offer">
      <Compass size={20} aria-hidden="true" />
      <div>
        <strong>New to Arconis?</strong>
        <p>A short tour shows where everything is. It changes nothing in this room.</p>
        <div className="orientation-actions">
          <button
            className="primary"
            data-hint-detail="Walk through the workspace's main areas, one highlighted step at a time."
            onClick={() => {
              close();
              onTour();
            }}
          >
            Take the tour
          </button>
          <button
            data-hint-detail="Dismiss the offer. Help can start the tour whenever you like."
            onClick={close}
          >
            Not now
          </button>
        </div>
      </div>
    </section>
  );
}
