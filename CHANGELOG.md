# Changelog

## Unreleased

## 0.1.2 — Desktop release polish

### Added

- Desktop app now shows its installed RTB version in the header.

### Changed

- GitHub Actions desktop/release workflows opt into Node 24 for JavaScript actions and rebuild desktop packages when release workflow files change.

## 0.1.1 — Desktop UX and safer board files

First productized desktop build after the initial Tauri MVP.

### Added

- Visible save status in the header: saving, saved, local/demo, and error states.
- Recent desktop board files dropdown for quickly reopening Markdown boards.
- GitHub Release workflow for Windows/macOS desktop packages.
- Desktop installation/update guide in `INSTALL.md`.
- Automatic Markdown file backups before saving desktop boards.

### Fixed

- Light/parrot theme achievement toasts now stay readable.

### Notes

- Desktop builds target Windows and macOS via GitHub Actions.
- macOS artifacts are currently Apple Silicon builds.
- In-app auto-update is not enabled yet; updates are manual through GitHub Releases/artifacts.
