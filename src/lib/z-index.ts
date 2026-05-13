/**
 * Unified z-index scale for the doctor portal (and the rest of the app).
 *
 * Centralising layer values prevents the "dropdown hidden behind another card"
 * bug from coming back. Always pick a token from this scale instead of writing
 * `z-30 / z-40 / z-50` ad-hoc inside components.
 *
 * Numeric scale (low → high):
 *   base       0     normal flow
 *   raised    10     hovered cards, sticky table headers inside a panel
 *   header    40     page header / sticky top bars
 *   dropdown  60     popovers, kebab menus, "send to" menu, tooltips
 *   overlay   70     full-screen modal backdrops + dialog content
 *   toast     90     sonner / toast notifications
 *   max      100     install prompt, critical system banners
 */
export const Z = {
  base: "z-0",
  raised: "z-10",
  header: "z-40",
  dropdown: "z-[60]",
  overlay: "z-[70]",
  toast: "z-[90]",
  max: "z-[100]",
} as const;

export type ZToken = keyof typeof Z;
