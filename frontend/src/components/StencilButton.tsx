import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
const DRAG_THRESHOLD = 4;
function createGhost(button: HTMLElement) {
  const ghost = button.cloneNode(true) as HTMLElement;
  ghost.classList.add("stencil-ghost");
  document.body.append(ghost);
  return ghost;
}

export function StencilButton({
  label,
  pressed,
  onArm,
  onDrop,
  children,
}: Readonly<{
  label: string;
  pressed: boolean;
  onArm: () => void;
  onDrop: (event: PointerEvent) => void;
  children: ReactNode;
}>) {
  const dragged = useRef(false);
  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const { clientX: startX, clientY: startY } = event;
    const button = event.currentTarget;
    dragged.current = false;
    let ghost: HTMLElement | null = null;
    const move = (moveEvent: PointerEvent) => {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!ghost && distance < DRAG_THRESHOLD) return;
      dragged.current = true;
      ghost ??= createGhost(button);
      ghost.style.transform = `translate(${moveEvent.clientX}px, ${moveEvent.clientY}px)`;
    };
    const finish = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      ghost?.remove();
      if (ghost && button.isConnected) onDrop(upEvent);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };
  return (
    <button
      className="tool stencil"
      data-hint={label}
      data-hint-detail="Drag this onto the canvas, or choose it and then click where it goes."
      aria-label={label}
      aria-pressed={pressed}
      onPointerDown={startDrag}
      onClick={() => {
        if (!dragged.current) onArm();
      }}
    >
      {children}
    </button>
  );
}
