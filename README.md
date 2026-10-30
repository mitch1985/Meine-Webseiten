# SV Hagenbüchach – statische Website

This project is the maintainable source for a static HTML rebuild. The HTTrack
download remains in `sv-hagenbuechach.de/sv-hagenbuechach.de` as the content
archive. The import script extracts article and page content, rewrites internal
links, copies only referenced media, and optimizes large JPEGs for web delivery.
Generated output is written to `dist/`.

## Development

- Install dependencies with `npm install`.
- Install media optimization dependencies with `python -m pip install -r requirements.txt`.
- Build the site and import the archive with `npm run build`.
- Preview the site locally with `npm run serve`.

## Online-Vorschau

GitHub Actions baut und veröffentlicht den Branch `modernisierung` nach GitHub
Pages. Die Website ist unter
`https://mitch1985.github.io/Meine-Webseiten/` erreichbar, sobald GitHub Pages
im Repository unter **Settings → Pages** als Quelle **GitHub Actions**
konfiguriert ist. Jeder Push auf `modernisierung` startet einen neuen Build und
eine Veröffentlichung.

Für die erstmalige Aktivierung benötigt der Workflow das Repository-Secret
`GH_PAGES_TOKEN` mit einem Fine-grained Personal Access Token, der auf dieses
Repository beschränkt ist und **Administration: Read and write** sowie
**Pages: Read and write** besitzt. Das Secret wird unter
**Settings → Secrets and variables → Actions** angelegt und nicht im
Repository gespeichert. Als Secret-Wert muss der vollständige Token verwendet
werden, nicht sein Name oder ein Platzhalter.

Der Build verwendet dafür das URL-Präfix `/Meine-Webseiten/`; lokal bleibt das
Präfix `/`. Vor einer Veröffentlichung Kontakt- und Rechtstexte auf Aktualität
prüfen.

Shared markup is in `site/_includes/layouts/`; theme colors and
responsive/accessibility styles are in `site/assets/css/site.css`. Imported
pages and referenced images are generated during the build and are not edited
by hand. The theme selector offers the club, Halloween, autumn, and floodlight
themes, and stores the selected theme in the browser.

News and event entries remain individual pages and are grouped into generated
archive indexes. General pages are organized into sport, club, and legal
sections. Review imported contact details and legal content before publishing
`dist/`; the import preserves source text and does not verify whether it is
current.
