# VOXA Global Design System

This document outlines the official visual identity metrics and design system constraints for the VOXA digital product suite. It enforces a consistent, modern, SaaS-grade aesthetic across the entire web application.

---

## 🔹 1. Foundation
The VOXA design identity is anchored on the traits extracted from the core logo:
* **Deep navy** primary text.
* **Fluid gradient wave** sweeping from blue to violet.
* **Clean, modern, SaaS-grade** aesthetic.
* **Soft glow accents** and **smooth curves** with no harsh edges.
* A **Premium, intelligent, AI-first** feel.

---

## 🔹 2. Design Tokens

### Primary Brand Colors
* **Navy (`--voxa-navy`)**: `#1B1F3B` *(Primary headings, strong contrast text)*
* **Blue (`--voxa-blue`)**: `#4A90E2`
* **Cyan (`--voxa-cyan`)**: `#5FD0F3`
* **Purple (`--voxa-purple`)**: `#7A5CFF`
* **Violet (`--voxa-violet`)**: `#B57CFF`

### Global Gradient Systems
* **Primary Accent (`.bg-voxa-brand-gradient`)**: `linear-gradient(90deg, #4A90E2 0%, #5FD0F3 30%, #7A5CFF 65%, #B57CFF 100%)`
  * *Usage*: Primary Call-to-Actions (CTAs), feature highlights, hover states, active states, active link indicators.
* **Background Fade (`.bg-voxa-gradient-soft`)**: `linear-gradient(135deg, rgba(95,208,243,0.14) 0%, rgba(74,144,226,0.1) 52%, rgba(122,92,255,0.12) 100%)`

### Environment Backgrounds
* **Light Mode**:
  * **Main background**: `#F8FAFF`
  * **Section alternate**: `#F1F5FF`
  * **Card background**: `#FFFFFF`
* **Dark Mode**:
  * **Main background**: `#0F1226`
  * **Card background**: `#171A35`

---

## 🔹 3. Typography & Contrast

All body text must meet standard WCAG AA contrast ratios against backgrounds.
*   **Font**: Inter / Geist / Modern SaaS Sans.
*   **Headings**: Semi-bold (600) or Bold (700) - Large hero headlines should use **Navy**, not gradient text.
*   **Body Text**: Regular (400).
*   **CTA labels**: Medium (500) or Semi-bold (600).
*   **Light Mode Constraints**: Navy (`#1B1F3B`) text on light backgrounds.
*   **Dark Mode Constraints**: White (`#FFFFFF`) primary text, Light Blue-Grey (`#C9D1FF`) secondary text.
*   **Accent Usage**: Gradient text (`.text-voxa-gradient`) is allowed ONLY for **key metrics, AI labels, or feature highlights**.

---

## 🔹 4. Component Styling Rules

### Elevation & Shape
*   **Rounding/Border Radius**: Standardized soft rounding. Use `12px` (`.rounded-xl`) or `16px` (`.rounded-2xl` / `.rounded-[16px]`). No sharp or harsh edges.
*   **Shadows**: Subtle 4–8% shadow depth for elevation hierarchy. Example: `0 18px 40px rgb(3 6 18 / 0.5)` for dark mode, subtle `rgb(15 23 42 / 0.08)` for light mode (`.shadow-voxa`). No strong/heavy shadows over 15%.

### Buttons
*   **Primary**: Gradient background (`.bg-voxa-brand-gradient`), white text, `12px` border radius, subtle glow on hover.
*   **Secondary**: White/Card background, Navy border, Navy text. Gradient border on hover.
*   **Ghost**: Transparent background, Navy text. Light blue hover background.
*   *Interaction*: Buttons must have visible hover + focus states. Ensure smooth 150–250ms transitions without bounce effects.

### Cards
*   **Background**: Solid `#FFFFFF` (Light mode) or `#171A35` (Dark mode) without heavy flat blocks of purple.
*   **Border Radius**: `16px`.
*   **Border Tint**: Slight border tint, example: `#DCE3FF` (Light) or `#303554` (Dark).
*   **Shadow**: Soft elevated shadows (`.shadow-voxa`).

### Interactive Elements
*   **Navigation**: Clean white or soft blue active container. Active link indicator uses the gradient underline or gradient icon token.
*   **Inputs & Forms**: Light borders, standard focus gradient rings, soft red errors (not aggressive), and Navy labels.

---

## 🔹 5. Visual Behavior

The application must feel:
*   **Intelligent & AI-native**
*   **Enterprise SaaS**
*   **Clean, Scalable, Fluid**

AVOID:
*   Random un-matched colors.
*   Harsh blacks (`#000000`).
*   Inconsistent border radii.
*   Playful, cartoonish, or overly neon stylizations.
