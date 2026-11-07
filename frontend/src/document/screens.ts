export interface ScreenSize {
  name: string;
  width: number;
  height: number;
}

/** Common sizes for a panel used as a screen, in CSS pixels. */
export const SCREEN_SIZES: ScreenSize[] = [
  { name: "Phone", width: 390, height: 844 },
  { name: "Tablet", width: 820, height: 1180 },
  { name: "Laptop", width: 1440, height: 900 },
  { name: "Desktop", width: 1920, height: 1080 },
];
