/** What the controls guide needs from the app config (kept in one place so the guide stays accurate). */
import { BUILD as CFG_BUILD, MODE_COLORS as CFG_COLORS, MODE_ORDER as CFG_ORDER, SENSITIVITY as CFG_SENS } from '../config';

export const MODE_ORDER = CFG_ORDER;
export const MODE_COLORS = CFG_COLORS;
export const SENSITIVITY = CFG_SENS;
export const BUILD = CFG_BUILD;
/** GPIO behind B0..B3 after the finger-order button map (B3 = pinky = GPIO 27). */
export const BUTTON_GPIO_ORDER = [13, 25, 26, 27];
