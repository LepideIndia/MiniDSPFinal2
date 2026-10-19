  # Lepide design reference

  This document is a working reference for the Lepide design system used by the project. It reflects the live design-system site at https://lepidus-design-system-button.vercel.app/ and the machine-readable guidance in https://lepidus-design-system-button.vercel.app/llms.txt.

  ## Source of truth

  - Primary live site: https://lepidus-design-system-button.vercel.app/
  - Machine-readable rules: https://lepidus-design-system-button.vercel.app/llms.txt
  - AI setup / ready-made rules file: https://lepidus-design-system-button.vercel.app/ai/
  - Component manifest: https://lepidus-design-system-button.vercel.app/component-manifest.json
  - Getting started: https://lepidus-design-system-button.vercel.app/get-started/
  - Components docs: https://lepidus-design-system-button.vercel.app/components/
  - Tokens: https://lepidus-design-system-button.vercel.app/tokens/
  - Foundations: https://lepidus-design-system-button.vercel.app/foundations/
  - Storybook: https://lepidus-design-system-button.vercel.app/storybook/

  ## Approved asset paths

  - Full stylesheet (tokens + components): https://lepidus-design-system-button.vercel.app/v1/lepidus.css
  - Behaviour script: https://lepidus-design-system-button.vercel.app/v1/lepidus.js
  - Tokens CSS: https://lepidus-design-system-button.vercel.app/lepidus/tokens.css
  - Components CSS: https://lepidus-design-system-button.vercel.app/lepidus/lepidus.components.css

  The npm packages named in the docs (`@ramsarjal-404/css`, `@ramsarjal-404/react`, `@ramsarjal-404/tokens`) were checked and currently return 404 on npm. For this project, use the hosted stylesheet/script instead of installing packages from npm.

  ## Core rules

  - Default to plain HTML + `lp-` classes for product UI.
  - Use `@ramsarjal-404/react` only when the project already uses React.
  - Never hardcode colours, radii, spacing or font sizes. Use the token variables: `var(--component-*)` first, then `var(--color-*)`, `var(--space-*)`, `var(--radius-*)`.
  - Set `data-theme="light|dark|hc"` on `<html>`; light is the default.
  - Class naming is BEM with an `lp-` prefix.
  - Buttons and inputs are pill-shaped by tokens; do not override their radius or shape.
  - Follow documented accessibility patterns: `:focus-visible`, `aria-invalid` + described-by patterns, `role="switch"`, `aria-current="page"`, and WCAG 2.1 AA targets.
  - Do not invent undocumented classes. Only use classes shown in the live component docs/specifications.

  ## Typography and font rules

  - Font family: Open Sans for regular UI (`var(--font-family-primary)`).
  - Heading font: Sora for headings.
  - Weights used in docs: Open Sans 400/500/600/700; Sora 600/700/800.
  - Prefer `next/font/google` in Next.js to self-host fonts at build time.

  ## Theme and tokens

  The design system is token-based and generated from Figma (DTCG -> CSS variables). The site describes 535 CSS variables. Use semantic tokens rather than raw values.

  Recommended token patterns:

  - Button tokens: `--component-button-{primary|secondary|danger|white}-{fill|stroke|text}` and hover states `-hover-fill`
  - Status tokens: `--component-status-{success|warning|error|na}-{bg|text}`
  - Input tokens: `--component-input-{bg|border|text|placeholder|label|radius}` and focus variants
  - Surface tokens: `--color-background-{page|surface|raised|subtle|cards}`
  - Text tokens: `--color-text-{primary|secondary|disabled|inverse|brand|danger}`
  - Focus ring: `--color-focus-ring`
  - Brand border: `--color-border-brand`

  ## Plain CSS component inventory

  The docs list the following classes as the approved plain-CSS API. These are the components that are safe to use without inventing custom CSS.

  ### Button

  Classes: `lp-button`, `lp-button--primary`, `lp-button--secondary`, `lp-button--danger`, `lp-button--white`, `lp-button--sm`, `lp-button--md`, `lp-button--lg`, `lp-button--full-width`, `lp-button__icon-left`, `lp-button__icon-right`

  ### Badge

  Classes: `lp-badge`, `lp-badge--default`, `lp-badge--success`, `lp-badge--warning`, `lp-badge--error`, `lp-badge--neutral`, `lp-badge__dot`

  ### Tag

  Classes: `lp-tag`, `lp-tag--disabled`, `lp-tag__label`, `lp-tag__remove`

  ### Card

  Classes: `lp-card`, `lp-card--elevated`, `lp-card--borderless`, `lp-card__header`, `lp-card__title`, `lp-card__actions`, `lp-card__body`, `lp-card__footer`

  ### Input

  Classes: `lp-input`, `lp-input--full-width`, `lp-input__row`, `lp-input__row--label-top`, `lp-input__row--label-left`, `lp-input__label`, `lp-input__field`, `lp-input__field--error`, `lp-input__field--disabled`, `lp-input__input`, `lp-input__icon-left`, `lp-input__icon-right`, `lp-input__message`, `lp-input__message--error`, `lp-input__message--indent`

  ### Toggle

  Classes: `lp-toggle`, `lp-toggle--on`, `lp-toggle__thumb`

  Use a real button with `role="switch"` and `aria-checked`.

  ### Checkbox

  Classes: `lp-checkbox`, `lp-checkbox--disabled`, `lp-checkbox__control`, `lp-checkbox__input`, `lp-checkbox__box`, `lp-checkbox__box--error`, `lp-checkbox__check`, `lp-checkbox__dash`, `lp-checkbox__label`

  ### Breadcrumb

  Classes: `lp-breadcrumb`, `lp-breadcrumb__list`, `lp-breadcrumb__item`, `lp-breadcrumb__link`, `lp-breadcrumb__separator`, `lp-breadcrumb__current`

  ### Table

  Classes: `lp-table`, `lp-table__table`, `lp-table__th`, `lp-table__header-inner`, `lp-table__header-label`, `lp-table__sort-button`, `lp-table__sort-arrow`, `lp-table__sort-arrow--active`, `lp-table__sort-arrow--desc`, `lp-table__filter-cell`, `lp-table__filter-field`, `lp-table__filter-input`, `lp-table__td`, `lp-table__cell-inner`, `lp-table__cell-text`, `lp-table__row--selected`, `lp-table__checkbox`

  ### Alert panel

  Classes: `lp-alert-panel`, `lp-alert-panel__icon`, `lp-alert-panel__headline`, `lp-alert-panel__title`, `lp-alert-panel__summary`, `lp-alert-panel__details`, `lp-alert-panel__action`, `lp-alert-panel__footnote`

  ### Link

  Classes: `lp-link`, `lp-link--inline`, `lp-link--standalone`, `lp-link--disabled`, `lp-link__icon`, `lp-link__external-icon`, `lp-link__visually-hidden`

  ### Avatar

  Classes: `lp-avatar`, `lp-avatar--sm`, `lp-avatar--md`, `lp-avatar--lg`, `lp-avatar--xl`, `lp-avatar--circle`, `lp-avatar--square`, `lp-avatar--series1` ... `lp-avatar--series6`, `lp-avatar--overflow`, `lp-avatar__image`, `lp-avatar__fallback`, `lp-avatar__status`, `lp-avatar__status--online`, `lp-avatar__status--away`, `lp-avatar__status--offline`, `lp-avatar-group`, `lp-avatar-group__item`

  ### Skeleton

  Classes: `lp-skeleton`, `lp-skeleton--text`, `lp-skeleton--circle`, `lp-skeleton--rect`, `lp-skeleton-paragraph`, `lp-skeleton-paragraph__last-line`

  ### Spinner

  Classes: `lp-spinner`, `lp-spinner--sm`, `lp-spinner--md`, `lp-spinner--lg`, `lp-spinner__svg`, `lp-spinner__track`, `lp-spinner__arc`, `lp-spinner__visually-hidden`

  SVG notes from the docs:

  - `viewBox="0 0 24 24"`
  - circles with `cx/cy="12"`, `r="10"`, `stroke-width="3"`
  - arc uses `stroke-dasharray="28 72"` and `path-length="100"`

  ### Message

  Classes: `lp-message`, `lp-message--info`, `lp-message--success`, `lp-message--warning`, `lp-message--error`, `lp-message__icon`, `lp-message__content`, `lp-message__text`, `lp-message__title`, `lp-message__body`, `lp-message__actions`, `lp-message__close`

  ### Empty state

  Classes: `lp-empty-state`, `lp-empty-state__illustration`, `lp-empty-state__message`, `lp-empty-state__action`

  ### Radio

  Classes: `lp-radio`, `lp-radio--disabled`, `lp-radio__control`, `lp-radio__input`, `lp-radio__circle`, `lp-radio__circle--error`, `lp-radio__dot`, `lp-radio__label`, `lp-radio-group`, `lp-radio-group__label`, `lp-radio-group__options`, `lp-radio-group__options--horizontal`

  ### Progress

  Classes: `lp-progress`, `lp-progress--completed`, `lp-progress--pending`, `lp-progress--full-width`, `lp-progress__label`, `lp-progress__row`, `lp-progress__track`, `lp-progress__fill`, `lp-progress__value`, `lp-progress__clock`

  ### Steps

  Classes: `lp-steps`, `lp-steps__item`, `lp-steps__step-button`, `lp-steps__circle`, `lp-steps__circle--done`, `lp-steps__circle--current`, `lp-steps__circle--upcoming`, `lp-steps__dot`, `lp-steps__connector`, `lp-steps__connector--done`, `lp-steps__label`

  ### Pagination

  Classes: `lp-pagination`, `lp-pagination__label`, `lp-pagination__button`, `lp-pagination__page-input`, `lp-pagination__page-size`, `lp-pagination__page-size-trigger`, `lp-pagination__page-size-chevron`, `lp-pagination__page-size-panel`, `lp-pagination__page-size-option`, `lp-pagination__page-size-option--selected`

  ## Interactive components that require `lepidus.js`

  Include the script:

  ```html
  <script src="lepidus.js"></script>
  ```

  The script auto-initializes the following components:

  ### Tabs

  Classes: `lp-tabs`, `lp-tabs__tab`, `lp-tabs__tab--active`

  Required behavior:

  - Use `data-lp-tabs` on the tablist container.
  - `role="tablist"` on the parent.
  - Each tab button uses `role="tab"`, `aria-selected`, and `aria-controls`.
  - Panels use `role="tabpanel"` and inactive ones are `hidden`.
  - Keyboard support includes arrows, Home, End, and roving tabindex.

  ### Modal

  Classes: `lp-modal`, `lp-modal__shell`, `lp-modal__shell--sm`, `lp-modal__shell--md`, `lp-modal__shell--lg`, `lp-modal__shell--inline`, `lp-modal__header`, `lp-modal__header--center`, `lp-modal__header--left`, `lp-modal__title`, `lp-modal__body`, `lp-modal__fields`, `lp-modal__field-label`, `lp-modal__footer`

  Required behavior:

  - Backdrop is hidden when closed.
  - Use `role="dialog"`, `aria-modal`, and `aria-labelledby`.
  - Trigger via `data-lp-modal-open="<id>"`.
  - Close via `data-lp-modal-close`, Escape, or backdrop click.
  - Focus is trapped and restored.
  - Use `data-lp-autofocus` for initial focus.
  - JS API: `Lepidus.openModal(id)`, `Lepidus.closeModal()`.

  ### Accordion

  Classes: `lp-accordion`, `lp-accordion__item`, `lp-accordion__heading`, `lp-accordion__trigger`, `lp-accordion__title`, `lp-accordion__chevron`, `lp-accordion__panel`, `lp-accordion__panel--open`, `lp-accordion__panel-inner`, `lp-accordion__panel-content`

  ### Dropdown

  Classes: `lp-dropdown`, `lp-dropdown__trigger`, `lp-dropdown__trigger--disabled`, `lp-dropdown__trigger-label`, `lp-dropdown__chevron`, `lp-dropdown__chevron--open`, `lp-dropdown__panel`, `lp-dropdown__header`, `lp-dropdown__header-label`, `lp-dropdown__list`, `lp-dropdown__option`, `lp-dropdown__checkbox`, `lp-dropdown__option-label`, `lp-dropdown__footer`

  Use `data-lp-dropdown="multi"|"single"`.

  Fires custom event: `lp-dropdown-change`.

  ### Stepper

  Classes: `lp-stepper`, `lp-stepper--full-width`, `lp-stepper--disabled`, `lp-stepper__input`, `lp-stepper__controls`, `lp-stepper__control`

  ### Toast

  Classes: `lp-toast`, `lp-toast--success`, `lp-toast--warning`, `lp-toast--error`

  JS API:

  ```js
  Lepidus.toast({
    title: 'Saved',
    message: 'Your changes were saved successfully.',
    variant: 'success',
    duration: 4000,
  });
  ```

  ### Tooltip

  Use `data-lp-tooltip="text"` on any interactive element. The tooltip bubble is `lp-tooltip` with `role="tooltip"` and `aria-describedby` wiring.

  ## Components not yet converted to plain CSS

  The docs list these as unavailable in plain HTML/CSS and requiring the React package or waiting for a CSS conversion:

  - ActionItem
  - Calendar
  - Charts
  - Filter
  - FolderTree
  - Scrollbar
  - SettingsPanel
  - Sidebar
  - TextField
  - Textarea
  - TimePicker

  ## React usage

  The docs show:

  ```tsx
  import { Button } from '@ramsarjal-404/react';

  <Button variant="primary" size="md">Save</Button>
  ```

  The CSS ordering is:

  1. tokens CSS
  2. React package style CSS

  ## Accessibility and markup rules

  - Use `:focus-visible` styling for keyboard focus.
  - For form validation, use `aria-invalid` with `aria-describedby`.
  - For toggles, use `role="switch"` and `aria-checked`.
  - For breadcrumb current pages, use `aria-current="page"`.
  - Target WCAG 2.1 AA.

  ## Practical implementation rules for this project

  - Use semantic CSS variables instead of raw hex/rgb values.
  - Keep all interactive surfaces pill-shaped unless the component docs explicitly define a different radius.
  - Do not invent new component classes or custom tokens unless they are required and documented by the system.
  - When a design decision is unclear, consult the live component docs before coding.
  - If the local project or stylesheet is missing the exact class, do not assume or improvise a variant; either use an approved documented class or note the gap.

  ## Licensing and brand caution

  - Fonts are Open Sans and Sora from Google Fonts, both open-source.
  - Icons are inline SVG and not a formal icon kit.
  - The official Lepide logo was not found as a formal asset in the docs; the “L” mark appears to be placeholder branding, not an approved design asset.
  - The design system credits Ram Sarjal, but the docs do not clearly state broader reuse terms. Confirm before any non-training or production reuse.

  ## Summary

  The correct working model is:

  - Build with semantic tokens.
  - Add `[data-theme="light|dark|hc"]` on the root.
  - Use documented `lp-*` classes and markup.
  - For interactive behavior, include `lepidus.js` and follow the accessibility patterns in the docs.
  - Never hardcode colour or spacing values beyond the documented token system.
