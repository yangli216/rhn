# Shared form hint tooltip verification

This folder records the shared `FormField` hint migration from persistent helper lines to label-adjacent information tooltips.

## Evidence

- `01-before.png`: matched desktop source state before the foundation change.
- `02-after.png`: matched desktop implementation with compact label icons.
- `03-tooltip-hover.png`: hover state for the immutable category-code hint.
- `04-validation.png`: empty create submission proving validation errors remain visible.
- `05-responsive-720.png`: narrow layout with no horizontal overflow.
- `06-parameter-form-global.png`: parameter-create form confirming cross-screen adoption.
- `07-before-after-comparison.png`: matched before/after views, left then right.

## Result

Hover and keyboard focus reveal the original hint text without consuming form space. Error messages remain inline, screen-reader descriptions remain connected to controls, and the shared build checks pass.
