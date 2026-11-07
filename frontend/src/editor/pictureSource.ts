type PictureSource = (hash: string, type: string, shared: boolean) => string | null;

/** Where styles reach the room's pictures, since a style is a pure function of its object. */
let source: PictureSource | null = null;
const listeners = new Set<() => void>();

export function notifyPictures() {
  listeners.forEach((listener) => listener());
}
export function setPictureSource(next: PictureSource | null) {
  source = next;
  notifyPictures();
}
export function subscribePictures(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function pictureImage(hash: string, type: string, shared: boolean) {
  return source?.(hash, type, shared) ?? null;
}
